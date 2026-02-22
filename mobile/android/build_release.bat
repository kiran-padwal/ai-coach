@echo off
set PATH=C:\Program Files\nodejs;%PATH%
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
set ANDROID_HOME=C:\Users\Kiran\AppData\Local\Android\Sdk
cd /d "C:\Users\Kiran\IdeaProjects\AAI coach\mobile\android"
call gradlew.bat app:assembleRelease > build_output.txt 2>&1
echo Exit code: %errorlevel% >> build_output.txt
