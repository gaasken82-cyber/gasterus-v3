$envRaw = Get-Content 'e:\gas terus 25\gasterus-v3\backend\.env' -Raw -ErrorAction Stop -Encoding UTF8
Write-Host 'ENV_READ=OK'
if ($envRaw -imatch '(?m)^spoRtmonks_api_key=(.+)$iS') {
    $raw = $Matches[1].Trim()
    $k = $raw.TrimEnd('"').TrimEnd("'")
    Write-Host ('KEY_FOUND=true')
    Write-Host ('KEY_LEN=' + $k.Length)
    Write-Host ('KEY_LAST4=****' + $k.Substring($k.Length - 4))

    $base = 'https://api.sportmonks.com/v3'
    $url = "$base/football/fixtures.json?api_token=$k&per_page=1"
    Write-Host ('TEST_URL=fixtures/per_page=1')

    try {
        $resp = Invoke-RestMethod -Uri $url -Method Get -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
        Write-Host 'STATE=HTTP_200'

        $hasData = $resp.PSObject.Properties['data']
        if ($hasData) {
            $datum = $hasData.Value
            $isArr = ($datum -is [System.Collections.ICollection] -and $datum -isnot [string])
            Write-Host ('DATA_IS_ARRAY=' + $isArr)

            if ($isArr) {
                $fix = @()
                foreach ($item in $datum) {
                    if ($item -is [System.Management.Automation.PSCustomObject] -and $item.PSObject.Properties['id'] -ne $null -and $item.PSObject.Properties['time'] -ne $null) {
                        $fix += $item
                    }
                    elseif ($item.PSObject.Properties['fixtures'] -and $item.PSObject.Properties['fixtures'].Value -ne $null) {
                        $sub = $item.PSObject.Properties['fixtures'].Value
                        if ($sub -is [System.Collections.ICollection] -and $sub -isnot [string]) {
                            foreach ($s in $sub) {
                                if ($s -is [System.Management.Automation.PSCustomObject]) {
                                    $fix += $s
                                }
                            }
                        }
                    }
                }

                Write-Host ('FIXTURES=' + $fix.Count)

                if ($fix.Count -gt 0) {
                    $f = $fix[0]
                    Write-Host ('HAS_ID=' + ($f.PSObject.Properties['id'] -ne $null))
                    Write-Host ('HAS_TIME=' + ($f.PSObject.Properties['time'] -ne $null))
                    Write-Host ('HAS_LEAGUE=' + ($f.PSObject.Properties['league'] -ne $null))
                    Write-Host ('HAS_TEAMS=' + ($f.PSObject.Properties['teams'] -ne $null))

                    $oddsOk = $false
                    if ($f.PSObject.Properties['odds'] -and $f.PSObject.Properties['odds'].Value -ne $null)      { $oddsOk = $true }
                    if ($f.PSObject.Properties['bets'] -and $f.PSObject.Properties['bets'].Value -ne $null)       { $oddsOk = $true }
                    if ($f.PSObject.Properties['bookmakers'] -and $f.PSObject.Properties['bookmakers'].Value -ne $null) { $oddsOk = $true }
                    Write-Host ('HAS_ODDS=' + $oddsOk)
                }
                else {
                    Write-Host 'DATA_FIELDS_NONE'
                }
            }
            else {
                $t = $datum.GetType().FullName
                Write-Host ('DATA_KIND=' + $t)
                if ($datum -is [System.Management.Automation.PSCustomObject]) {
                    Write-Host ('HAS_ID=' + ($datum.PSObject.Properties['id'] -ne $null))
                    Write-Host ('HAS_TIME=' + ($datum.PSObject.Properties['time'] -ne $null))
                    Write-Host ('HAS_LEAGUE=' + ($datum.PSObject.Properties['league'] -ne $null))
                    Write-Host ('HAS_TEAMS=' + ($datum.PSObject.Properties['teams'] -ne $null))

                    $o = $false
                    if ($datum.PSObject.Properties['odds'] -and $datum.PSObject.Properties['odds'].Value -ne $null)      { $o = $true }
                    if ($datum.PSObject.Properties['bets'] -and $datum.PSObject.Properties['bets'].Value -ne $null)       { $o = $true }
                    if ($datum.PSObject.Properties['bookmakers'] -and $datum.PSObject.Properties['bookmakers'].Value -ne $null) { $o = $true }
                    Write-Host ('HAS_ODDS=' + $o)
                }
                else {
                    Write-Host 'DATA_FIELDS_NONE'
                }
            }
        }
        else {
            Write-Host 'DATA_NONE'
        }
    }
    catch {
        $code = 'UNKNOWN'
        if ($_.Exception.Response -is [System.Net.HttpWebResponse])      { $code = $_.Exception.Response.StatusCode }
        elseif ($_.Exception.Response -is [System.Net.HttpStatusCode])   { $code = $_.Exception.Response }
        Write-Host ('STATE=HTTP_' + $code)
        $m = ($_.Exception.Message -replace '\s+', ' ').Substring(0, [Math]::Min(100, $_.Exception.Message.Length))
        Write-Host ('SUMM=' + $m)
    }
}
else {
    Write-Host 'KEY_FOUND=false'
}
