$ErrorActionPreference = "Stop"
Set-Location "C:\projects\world-sim-server"

# Make sure we're on main
git checkout main | Out-Null

# Fetch latest
git fetch origin main | Out-Null

# If no changes, exit cleanly
$local  = git rev-parse main
$remote = git rev-parse origin/main

if ($local -eq $remote) {
  Write-Host "No changes. Exiting."
  exit 0
}

Write-Host "Changes detected. Pulling and redeploying..."
git pull origin main

docker compose -f docker-compose.prod.yml up -d --build

Write-Host "Redeploy complete."
