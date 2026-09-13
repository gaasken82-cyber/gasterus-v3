import os, subprocess, time

DATA = r"C:\Program Files\PostgreSQL\18\data"
CONF = os.path.join(DATA, "pg_hba.conf")
BAK = CONF + ".safety_pw_bak"
PGCTL = r"C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe"
PSQL = r"C:\Program Files\PostgreSQL\18\bin\psql.exe"
NEWPASS = "GasterusPG!2026Strong"

def read_conf():
    with open(CONF, "r", encoding="ascii") as f:
        return f.read()

def write_conf(content):
    # ASCII (no BOM) — safe for pg_hba.conf
    with open(CONF, "w", encoding="ascii", newline="\n") as f:
        f.write(content)

def reload_pg():
    r = subprocess.run([PGCTL, "reload", "-D", DATA], capture_output=True, text=True)
    return r.returncode, (r.stdout + r.stderr).strip()

# 1) backup current clean scram config
original = read_conf()
if not os.path.exists(BAK):
    with open(BAK, "w", encoding="ascii") as f:
        f.write(original)
print("[1] backup:", os.path.exists(BAK))

# 2) set trust (temporary), no BOM
trusted = original.replace("scram-sha-256", "trust")
write_conf(trusted)
rc, out = reload_pg()
print("[2] set trust; reload rc=", rc, "|", out)
time.sleep(2)

# 3) ALTER USER postgres password (trust => no password needed)
r = subprocess.run(
    [PSQL, "-U", "postgres", "-h", "localhost", "-p", "5432",
     "-c", "ALTER USER postgres WITH PASSWORD '%s';" % NEWPASS],
    capture_output=True, text=True, env={**os.environ, "PGPASSWORD": ""},
)
print("[3] ALTER rc=", r.returncode, "|", (r.stdout + r.stderr).strip()[:300])

# 4) restore scram (from original), no BOM
write_conf(original)
rc, out = reload_pg()
print("[4] restore scram; reload rc=", rc, "|", out)
time.sleep(2)

# 5) verify connection with new password
r = subprocess.run(
    [PSQL, "-U", "postgres", "-h", "localhost", "-p", "5432", "-c", "SELECT now();"],
    capture_output=True, text=True, env={**os.environ, "PGPASSWORD": NEWPASS},
)
print("[5] AUTH TEST rc=", r.returncode)
if r.returncode == 0:
    print("    ", (r.stdout or "").strip().replace("\n", " | "))
    print("NEW POSTGRES PASSWORD:", NEWPASS)
else:
    print("    ", (r.stderr or "").strip()[:400])

# 6) confirm conf has no BOM
with open(CONF, "rb") as f:
    print("[6] conf first bytes:", f.read(8))
print("DONE")