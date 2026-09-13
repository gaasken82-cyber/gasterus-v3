#!/usr/bin/env python3
"""
Gasterus V3 - PostgreSQL password recovery (non-destructive)

Temporarily sets localhost authentication method to 'trust', reloads config,
sets a NEW password for user 'postgres', then restores 'scram-sha-256'.

Usage:
  1. Run this WITHOUT admin (edits pg_hba.conf, which we have write access to)
  2. It will attempt reload, connect, set password, restore, reload.

If the reload/connect step requires admin, the script will stop and print
the exact error + the one manual command you must run as Administrator.

Pass the new password as argv[1] to avoid it being typed interactively.
"""
import os
import shutil
import subprocess
import sys
import time

CONF = r"C:\Program Files\PostgreSQL\18\data\pg_hba.conf"
BACKUP = CONF + ".recovery_backup"
PSQL = r"C:\Program Files\PostgreSQL\18\bin\psql.exe"
PGCTL = r"C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe"
DATADIR = r"C:\Program Files\PostgreSQL\18\data"
NEW_PASSWORD = sys.argv[1] if len(sys.argv) > 1 else "GasterusRecovery!2026"

# --- 1. Backup (only if we haven't already) ---
if not os.path.exists(BACKUP):
    shutil.copy2(CONF, BACKUP)
    print("[1] Backup created:", BACKUP)
else:
    print("[1] Backup already exists:", BACKUP)

# --- 2. Read current config, verify active rules are scram-sha-256 (safety gate) ---
with open(CONF, "r", encoding="utf-8", errors="replace") as f:
    content = f.read()

# Only inspect real auth rule lines (non-comment, contains a known method token)
METHODS = {"trust", "reject", "md5", "password", "scram-sha-256", "cram-md5"}
active_rules = [
    line for line in content.splitlines()
    if line.strip() and not line.strip().startswith("#")
]
def rule_method(line):
    parts = line.split()
    return parts[-1] if parts else None
non_scram = [ln for ln in active_rules if rule_method(ln) not in ("scram-sha-256", None)]
if non_scram:
    print("[!] Active rules are NOT all scram-sha-256. Refusing to modify.")
    for ln in non_scram:
        print("      ", ln)
    sys.exit(1)

# --- 3. Replace scram-sha-256 -> trust (TEMPORARY) ---
modified = content.replace("scram-sha-256", "trust")
with open(CONF, "w", encoding="utf-8") as f:
    f.write(modified)
print("[2] pg_hba.conf set to 'trust' (TEMPORARY)")

# --- 4. Reload PostgreSQL config. This needs to be able to signal the server.
#         Tries pg_ctl reload first (works from data dir, often no admin needed).
def reload_config():
    try:
        r = subprocess.run(
            [PGCTL, "reload", "-D", DATADIR],
            capture_output=True, text=True, timeout=30,
        )
        return r.returncode, r.stdout, r.stderr
    except Exception as e:
        return -1, "", str(e)

code, out, err = reload_config()
print("[3] pg_ctl reload ->", code)
if out.strip():
    print("      out:", out.strip())
if err.strip():
    print("      err:", err.strip())
if code != 0:
    print("\n!!! PostgreSQL recovery needs ADMIN rights for reload.")
    print("!!! Run this ONE command as Administrator, then re-run me:\n")
    print('    pg_ctl reload -D "C:\\Program Files\\PostgreSQL\\18\\data"')
    # Restore config before exiting so we don't leave trust open
    with open(CONF, "w", encoding="utf-8") as f:
        f.write(content)
    print("\n    (config restored to original; run as admin, then re-run this script)")
    sys.exit(2)

time.sleep(2)

# --- 5. Connect WITHOUT password (trust mode) and set new password ---
env = dict(os.environ)
env.pop("PGPASSWORD", None)
cmd = [
    PSQL, "-U", "postgres", "-h", "localhost",
    "-c", f"ALTER USER postgres WITH PASSWORD '{NEW_PASSWORD}';",
]
r = subprocess.run(cmd, capture_output=True, text=True, timeout=60, env=env)
print("[4] ALTER USER postgres ->", r.returncode)
if r.returncode == 0:
    print("      New password set successfully (non-destructive ALTER).")
else:
    print("      stderr:", (r.stderr or "").strip())
    print("\n!!! Could not set password. Restoring config.")
    with open(CONF, "w", encoding="utf-8") as f:
        f.write(content)
    print("    Config restored to original.")
    sys.exit(3)

# --- 6. Restore original scram-sha-256 ---
with open(CONF, "w", encoding="utf-8") as f:
    f.write(content)
print("[5] pg_hba.conf restored to original (scram-sha-256)")

# --- 7. Reload again so restored config takes effect ---
code, out, err = reload_config()
print("[6] pg_ctl reload (restore) ->", code)

# --- 8. Test connection with PGPASSWORD ---
env["PGPASSWORD"] = NEW_PASSWORD
test = subprocess.run(
    [PSQL, "-U", "postgres", "-h", "localhost", "-c", "SELECT now();"],
    capture_output=True, text=True, timeout=30, env=env,
)
if test.returncode == 0:
    print("[7] AUTH TEST: PASS  -> SELECT now();")
    print("      ", (test.stdout or "").strip().replace("\n", " | "))
    print("\nPassword for 'postgres' is now:", NEW_PASSWORD)
else:
    print("[7] AUTH TEST: FAIL ->", (test.stderr or "").strip())

print("\nDONE (non-destructive recovery).")