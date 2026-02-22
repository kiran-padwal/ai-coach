$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = 'C:\Users\Kiran\AppData\Local\Android\Sdk'
Set-Location 'C:\Users\Kiran\IdeaProjects\AAI coach\mobile\android'
& '.\gradlew.bat' 'app:assembleRelease'
Write-Host "ExitCode: $LASTEXITCODE"
