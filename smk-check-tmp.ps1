$envRaw = Get-Content 'backend\.env' -Raw -ErrorAction Stop -Encoding UTF8
if ($envRaw -imatch '(?m)^spoRtmonks_api_key=(.+)$iS') {
    $raw = $Matches[1].Trim()
    $k = $raw.TrimEnd('"').TrimEnd("'")
} else {
    Write-Output 'STATE=MISSING_KEY'
    exit 0
}

$kLen = $k.Length
Write-Output ("KEY_LEN=$kLen")
Write-Output ("KEY_LAST4=****$($k.Substring($kLen - 4))")

$base = 'https://api.sportmonks.com/v3'
$url = "$base/football/fixtures.json?api_token=$k&per_page=1"

try {
    $resp = Invoke-RestMethod -Uri $url -Method Get -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
    Write-Output 'STATE=HTTP_200'
    $hasData = $resp.PSObject.Properties['data']
    if ($hasData) {
        $datum = $hasData.Value
        $isArr = $false
        if ($datum -is [System.Collections.ICollection] -and $datum -isnot [string]) { $isArr = $true }
        if ($isArr) {
            $fix = @()
            foreach ($item in $datum) {
                if ($item -is [System.Management.Automation.PSCustomObject] -and $item.PSObject.Properties['id'] -ne $null -and $item.PSObject.Properties['time'] -ne $null) { $fix += $item }
                elseif ($item.PSObject.Properties['fixtures'] -and $item.PSObject.Properties['fixtures'].Value -ne $null) {
                    $sub = $item.PSObject.Properties['fixtures'].Value
                    if ($sub -is [System.Collections.ICollection] -and $sub -isnot [string]) {
                        foreach ($s in $sub) {
                            if ($s -is [System.Management.Automation.PSCustomObject]) { $fix += $s }
                        }
                    }
                }
            }
            Write-Output ("FIXTURES=$($fix.Count)")
            if ($fix.Count -gt 0) {
                $f = $fix[0]
                Write-Output ("HAS_ID=" + ($f.PSObject.Properties['id'] -ne $null))
                Write-Output ("HAS_TIME=" + ($f.PSObject.Properties['time'] -ne $null))
                Write-Output ("HAS_LEAGUE=" + ($f.PSObject.Properties['league'] -ne $null))
                Write-Output ("HAS_TEAMS=" + ($f.PSObject.Properties['teams'] -ne $null))
                $oddsOk = $false
                if ($f.PSObject.Properties['odds'] -and $f.PSObject.Properties['odds'].Value -ne $null) { $oddsOk = $true }
                if ($f.PSObject.Properties['bets'] -and $f.PSObject.Properties['bets'].Value -ne $null) { $oddsOk = $true }
                if ($f.PSObject.Properties['bookmakers'] -and $f.PSObject.Properties['bookmakers'].Value -ne $null) { $oddsOk = $true }
                Write-Output ("HAS_ODDS=" + $oddsOk)
            }
            else {
                Write-Output 'DATA_FIELDS_NONE'
            }
        }
        else {
            $t = $datum.GetType().FullName
            Write-Output ("DATA_KIND=$t")
            if ($datum -is [System.Management.Automation.PSCustomObject]) {
                $idP = $datum.PSObject.Properties['id']
                $timeP = $datum.PSObject.Properties['time']
                Write-Output ("HAS_ID=" + ($idP -ne $null))
                Write-Output ("HAS_TIME=" + ($timeP -ne $null))
                Write-Output ("HAS_LEAGUE=" + ($datum.PSObject.Properties['league'] -ne $null))
                Write-Output ("HAS_TEAMS=" + ($datum.PSObject.Properties['teams'] -ne $null))
                $o = $false
                if ($datum.PSObject.Properties['odds'] -and $datum.PSObject.Properties['odds'].Value -ne $null) { $o = $true }
                if ($datum.PSObject.Properties['bets'] -and $datum.PSObject.Properties['bets'].Value -ne $null) { $o = $true }
                Write-Output ("HAS_ODDS=" + $o)
            }
            else {
                Write-Output 'DATA_FIELDS_NONE'
            }
        }
    }
    else {
        Write-Output 'DATA_NONE'
    }
}
catch {
    $code = 'UNKNOWN'
    $msg = $_.Exception.Message
    if ($_.Exception.Response -is [System.Net.HttpWebResponse]) { $code = $_.Exception.Response.StatusCode }
    elseif ($_.Exception.Response -is [System.Net.HttpStatusCode]) { $code = $_.Exception.Response }
    Write-Output ("STATE=$code")
    $m = ($msg -replace '\s+', ' ').Substring(0, [Math]::Min(100, $msg.Length))
    Write-Output ("SUMM=$m")
}
