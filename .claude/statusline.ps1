# Claude Code Status Line Script
# Line 1: Model | ProgressBar UsedPct% | Tokens | [Branch] | Project
# Line 2: 5h limit | 7d limit (from Anthropic API)

# --- Helper: color by usage percentage (same thresholds as context bar) ---
function Get-UsageColor {
    param([int]$Pct, [string]$Esc)
    if ($Pct -ge 80)      { return "$Esc[31m" }   # red
    elseif ($Pct -ge 50)  { return "$Esc[33m" }   # yellow
    else                  { return "$Esc[32m" }    # green
}

# --- Helper: progress bar same style as context bar (# and -), width 10 ---
function New-UsageBar {
    param([int]$Pct, [string]$Color, [string]$Reset)
    $width  = 20
    $filled = [math]::Min([math]::Max([math]::Round($Pct * $width / 100), 0), $width)
    $empty  = $width - $filled
    return "$Color[" + ("#" * $filled) + ("-" * $empty) + "]$Reset"
}

# --- Helper: format seconds left as human-readable time ---
function Format-TimeLeft {
    param([int]$Seconds, [bool]$UseDays = $false)
    if ($Seconds -le 0) { return "0m" }
    if ($UseDays) {
        $days  = [math]::Floor($Seconds / 86400)
        $hours = [math]::Floor(($Seconds % 86400) / 3600)
        if ($days -gt 0)  { return "${days}d${hours}h" }
        $mins = [math]::Floor(($Seconds % 3600) / 60)
        if ($hours -gt 0) { return "${hours}h${mins}m" }
        return "${mins}m"
    } else {
        $hours = [math]::Floor($Seconds / 3600)
        $mins  = [math]::Floor(($Seconds % 3600) / 60)
        if ($hours -gt 0) { return "${hours}h${mins}m" }
        return "${mins}m"
    }
}

# --- Main: fetch & format usage limits line ---
function Get-UsageLine {
    param([string]$Esc, [string]$Reset, [string]$Gray, [string]$Cyan, [string]$Sep)

    $cacheDir  = "$env:USERPROFILE\.cache"
    $cacheFile = "$cacheDir\claude-api-response.json"
    $lockFile  = "$cacheDir\claude-usage.lock"

    if (-not (Test-Path $cacheDir)) {
        New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null
    }

    $response = $null

    if (Test-Path $cacheFile) {
        $age = (Get-Date) - (Get-Item $cacheFile).LastWriteTime
        if ($age.TotalSeconds -lt 2) {
            $response = Get-Content $cacheFile -Raw -ErrorAction SilentlyContinue
        }
    }

    if (-not $response) {
        if (Test-Path $lockFile) {
            $lockAge = (Get-Date) - (Get-Item $lockFile).LastWriteTime
            if ($lockAge.TotalSeconds -lt 5) {
                $response = Get-Content $cacheFile -Raw -ErrorAction SilentlyContinue
                if (-not $response) { return $null }
            }
        }
    }

    if (-not $response) {
        [System.IO.File]::WriteAllText($lockFile, (Get-Date).ToString())

        # Read OAuth token from Claude Code credentials file
        $credsFile = "$env:USERPROFILE\.claude\.credentials.json"
        if (-not (Test-Path $credsFile)) { return $null }

        try   { $credData = (Get-Content $credsFile -Raw) | ConvertFrom-Json } catch { return $null }
        $token = $credData.claudeAiOauth.accessToken
        if (-not $token) { return $null }

        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            $resp = Invoke-RestMethod `
                -Uri "https://api.anthropic.com/api/oauth/usage" `
                -Headers @{ "Authorization" = "Bearer $token"; "anthropic-beta" = "oauth-2025-04-20" } `
                -TimeoutSec 5 -ErrorAction Stop
            $response = $resp | ConvertTo-Json -Depth 10
            $response | Out-File $cacheFile -Encoding utf8 -NoNewline
        } catch {
            $response = Get-Content $cacheFile -Raw -ErrorAction SilentlyContinue
        }
    }

    if (-not $response) { return $null }
    try { $data = $response | ConvertFrom-Json } catch { return $null }

    $fiveH  = $data.five_hour.utilization
    $sevenD = $data.seven_day.utilization

    if ($null -eq $fiveH -and $null -eq $sevenD) {
        return "${Gray}Max$Reset"
    }

    $parts = @()

    if ($null -ne $fiveH) {
        $pct   = [int]$fiveH
        $color = Get-UsageColor -Pct $pct -Esc $Esc
        $bar   = New-UsageBar   -Pct $pct -Color $color -Reset $Reset

        $label   = "5h"
        $resetAt = $data.five_hour.resets_at
        if ($resetAt) {
            try {
                $secsLeft = [int]([DateTimeOffset]::Parse($resetAt) - [DateTimeOffset]::UtcNow).TotalSeconds
                $label    = Format-TimeLeft -Seconds $secsLeft -UseDays $false
            } catch {}
        }
        $parts += "$Cyan${label}:$Reset $bar $color${pct}%$Reset"
    }

    if ($null -ne $sevenD) {
        $pct   = [int]$sevenD
        $color = Get-UsageColor -Pct $pct -Esc $Esc
        $bar   = New-UsageBar   -Pct $pct -Color $color -Reset $Reset

        $label   = "7d"
        $resetAt = $data.seven_day.resets_at
        if ($resetAt) {
            try {
                $secsLeft = [int]([DateTimeOffset]::Parse($resetAt) - [DateTimeOffset]::UtcNow).TotalSeconds
                $label    = Format-TimeLeft -Seconds $secsLeft -UseDays $true
            } catch {}
        }
        $parts += "$Cyan${label}:$Reset $bar $color${pct}%$Reset"
    }

    if ($parts.Count -eq 0) { return $null }
    return $parts -join $Sep
}

# ============================================================
# MAIN
# ============================================================
try {
    $input_json = @($input) -join "`n"
    if ([string]::IsNullOrWhiteSpace($input_json)) {
        $input_json = [Console]::In.ReadToEnd()
    }
    if ([string]::IsNullOrWhiteSpace($input_json)) {
        throw "No input received"
    }

    $data = $input_json | ConvertFrom-Json

    # ANSI colors
    $esc     = [char]27
    $reset   = "$esc[0m"
    $cyan    = "$esc[36m"
    $magenta = "$esc[35m"
    $blue    = "$esc[34m"
    $gray    = "$esc[90m"
    $sep     = "$gray | $reset"

    # 1. Model name
    $model = "$cyan$($data.model.display_name)$reset"

    # 2 & 3. Progress bar and percentage
    $used_pct    = $data.context_window.used_percentage
    $bar         = ""
    $pct_display = ""
    if ($null -ne $used_pct) {
        $filled = [math]::Round($used_pct / 5)
        if ($filled -lt 0)  { $filled = 0 }
        if ($filled -gt 20) { $filled = 20 }
        $empty = 20 - $filled

        if ($used_pct -ge 80)     { $color = "$esc[31m" }
        elseif ($used_pct -ge 50) { $color = "$esc[33m" }
        else                      { $color = "$esc[32m" }

        $bar         = "$color[" + ("#" * $filled) + ("-" * $empty) + "]$reset"
        $pct_display = "$color$([math]::Round($used_pct, 1))%$reset"
    }

    # 4. Tokens
    $tokens_display = ""
    $ctx      = $data.context_window.current_usage
    $ctx_size = $data.context_window.context_window_size
    if ($null -ne $ctx) {
        $total_tokens = $ctx.input_tokens + $ctx.cache_creation_input_tokens + $ctx.cache_read_input_tokens
        $used_str  = if ($total_tokens -ge 1000) { "$([math]::Round($total_tokens / 1000, 1))k" } else { "$total_tokens" }
        $limit_str = if ($null -ne $ctx_size -and $ctx_size -ge 1000) { "$([math]::Round($ctx_size / 1000))k" } else { "$ctx_size" }
        $tokens_display = "$color$used_str / $limit_str$reset"
    }

    # 5. Git branch
    $git_branch = ""
    $full_cwd   = $data.workspace.current_dir
    $git_dir    = Join-Path $full_cwd ".git"
    if (Test-Path $git_dir) {
        $env:GIT_OPTIONAL_LOCKS = "0"
        Push-Location $full_cwd
        $branch = git rev-parse --abbrev-ref HEAD 2>$null
        Pop-Location
        if ($branch) { $git_branch = "$magenta[$branch]$reset" }
    }

    # 6. Project name
    $project = "$blue$(Split-Path -Leaf $full_cwd)$reset"

    # Build line 1
    $parts = @($model)
    if ($bar -and $pct_display) { $parts += "$bar $pct_display" }
    if ($tokens_display)        { $parts += $tokens_display }
    if ($git_branch)            { $parts += $git_branch }
    $parts += $project
    $line1 = $parts -join $sep

    # Build line 2 (usage limits)
    $line2 = Get-UsageLine -Esc $esc -Reset $reset -Gray $gray -Cyan $cyan -Sep $sep

    if ($line2) {
        Write-Output "$line1`n$line2"
    } else {
        Write-Output $line1
    }
}
catch {
    Write-Output "Claude Code"
}
