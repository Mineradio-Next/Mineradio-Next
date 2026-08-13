param(
  [Parameter(Mandatory = $true)]
  [string]$InstallerPath,
  [int]$ParentProcessId = 0,
  [switch]$Uninstall,
  [string]$InstallPath = '',
  [switch]$ValidateOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$createdShellMutex = $false
$shellMutexName = $(if ($Uninstall) { 'Local\MineradioNextUninstallerShell' } else { 'Local\MineradioNextInstallerShell' })
$shellMutex = New-Object System.Threading.Mutex($true, $shellMutexName, [ref]$createdShellMutex)
if (-not $createdShellMutex) {
  $shellMutex.Dispose()
  exit 0
}

if ($ParentProcessId -gt 0) {
  $parentInstaller = Get-Process -Id $ParentProcessId -ErrorAction SilentlyContinue
  if ($null -ne $parentInstaller) {
    $parentInstaller.WaitForExit(10000) | Out-Null
  }
}

Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

$appGuid = 'b5312c9b-f0fb-5838-a062-92bdc24119f2'
$defaultInstallPath = Join-Path $env:LOCALAPPDATA 'Programs\Mineradio-Next'
$legacyInstallPath = Join-Path $env:LOCALAPPDATA 'Programs\Mineradio'
$registryPath = "HKCU:\Software\$appGuid"
$reduceMotion = (Get-ItemPropertyValue -Path 'HKCU:\Control Panel\Desktop\WindowMetrics' -Name MinAnimate -ErrorAction SilentlyContinue) -eq '0'

function Get-DetectedInstallPath {
  $registered = Get-ItemPropertyValue -Path $registryPath -Name InstallLocation -ErrorAction SilentlyContinue
  foreach ($candidate in @($registered, $defaultInstallPath, $legacyInstallPath)) {
    if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
    if (Test-Path -LiteralPath (Join-Path $candidate 'Mineradio-Next.exe')) { return $candidate }
    if (Test-Path -LiteralPath (Join-Path $candidate 'Mineradio.exe')) { return $candidate }
  }
  return $defaultInstallPath
}

function Test-InstallPath {
  param([string]$Path)
  if ([string]::IsNullOrWhiteSpace($Path)) { return '请选择安装位置' }
  $leaf = Split-Path -Leaf $Path.TrimEnd('\')
  if ($leaf -notin @('Mineradio-Next', 'Mineradio')) {
    return '请选择独立的 Mineradio-Next 文件夹'
  }
  if (Test-Path -LiteralPath $Path) {
    $known = @(
      (Join-Path $Path '.mineradio-install-root'),
      (Join-Path $Path 'resources\.mineradio-install-root'),
      (Join-Path $Path 'Mineradio-Next.exe'),
      (Join-Path $Path 'Mineradio.exe')
    ) | Where-Object { Test-Path -LiteralPath $_ }
    $hasAnything = @(Get-ChildItem -LiteralPath $Path -Force -ErrorAction SilentlyContinue).Count -gt 0
    if ($hasAnything -and $known.Count -eq 0) {
      return '这个文件夹已有其它内容，请选择空文件夹或现有安装目录'
    }
  }
  return $null
}

[xml]$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Mineradio Next 安装程序" Width="780" Height="500"
        WindowStartupLocation="CenterScreen" WindowStyle="None" ResizeMode="NoResize"
        AllowsTransparency="True" Background="Transparent"
        FontFamily="Segoe UI Variable Text, Microsoft YaHei UI, Segoe UI">
  <Window.Resources>
    <Style x:Key="PrimaryButtonStyle" TargetType="Button">
      <Setter Property="Width" Value="112"/>
      <Setter Property="Height" Value="40"/>
      <Setter Property="Background" Value="#111A1C"/>
      <Setter Property="Foreground" Value="#F3F6F5"/>
      <Setter Property="BorderThickness" Value="0"/>
      <Setter Property="FontSize" Value="12"/>
      <Setter Property="FontWeight" Value="SemiBold"/>
      <Setter Property="Cursor" Value="Hand"/>
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="Button">
            <Border x:Name="ButtonSurface" Background="{TemplateBinding Background}" CornerRadius="6" SnapsToDevicePixels="True">
              <Border.Effect><DropShadowEffect BlurRadius="12" ShadowDepth="4" Opacity="0.13" Color="#0E191C"/></Border.Effect>
              <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
            </Border>
            <ControlTemplate.Triggers>
              <Trigger Property="IsMouseOver" Value="True"><Setter TargetName="ButtonSurface" Property="Background" Value="#1B2729"/></Trigger>
              <Trigger Property="IsPressed" Value="True"><Setter TargetName="ButtonSurface" Property="RenderTransform"><Setter.Value><TranslateTransform Y="1"/></Setter.Value></Setter></Trigger>
              <Trigger Property="IsEnabled" Value="False"><Setter TargetName="ButtonSurface" Property="Opacity" Value="0.52"/></Trigger>
            </ControlTemplate.Triggers>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>
    <Style x:Key="TextButtonStyle" TargetType="Button">
      <Setter Property="Height" Value="40"/>
      <Setter Property="Padding" Value="3,0"/>
      <Setter Property="Background" Value="Transparent"/>
      <Setter Property="Foreground" Value="#657174"/>
      <Setter Property="BorderThickness" Value="0"/>
      <Setter Property="FontSize" Value="11"/>
      <Setter Property="FontWeight" Value="Medium"/>
      <Setter Property="Cursor" Value="Hand"/>
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="Button">
            <Border Background="Transparent"><ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/></Border>
            <ControlTemplate.Triggers>
              <Trigger Property="IsMouseOver" Value="True"><Setter Property="Foreground" Value="#172124"/></Trigger>
            </ControlTemplate.Triggers>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>
    <Style x:Key="WindowButtonStyle" TargetType="Button">
      <Setter Property="Width" Value="36"/>
      <Setter Property="Height" Value="36"/>
      <Setter Property="Background" Value="Transparent"/>
      <Setter Property="Foreground" Value="#839093"/>
      <Setter Property="BorderThickness" Value="0"/>
      <Setter Property="FontSize" Value="14"/>
      <Setter Property="Cursor" Value="Hand"/>
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="Button">
            <Border x:Name="WindowButtonSurface" Background="Transparent"><ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/></Border>
            <ControlTemplate.Triggers>
              <Trigger Property="IsMouseOver" Value="True"><Setter TargetName="WindowButtonSurface" Property="Background" Value="#152023"/><Setter Property="Foreground" Value="#E8EEEE"/></Trigger>
              <Trigger Property="IsEnabled" Value="False"><Setter Property="Opacity" Value="0.35"/></Trigger>
            </ControlTemplate.Triggers>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>
    <Style x:Key="ToggleStyle" TargetType="ToggleButton">
      <Setter Property="Width" Value="31"/>
      <Setter Property="Height" Value="18"/>
      <Setter Property="Cursor" Value="Hand"/>
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="ToggleButton">
            <Grid Width="31" Height="18">
              <Border x:Name="ToggleTrack" CornerRadius="9" Background="#CFD7D8"/>
              <Ellipse x:Name="ToggleThumb" Width="14" Height="14" Fill="White" HorizontalAlignment="Left" Margin="2,0,0,0">
                <Ellipse.Effect><DropShadowEffect BlurRadius="3" ShadowDepth="1" Opacity="0.16" Color="#142023"/></Ellipse.Effect>
              </Ellipse>
            </Grid>
            <ControlTemplate.Triggers>
              <Trigger Property="IsChecked" Value="True">
                <Setter TargetName="ToggleTrack" Property="Background" Value="#35B897"/>
                <Setter TargetName="ToggleThumb" Property="HorizontalAlignment" Value="Right"/>
                <Setter TargetName="ToggleThumb" Property="Margin" Value="0,0,2,0"/>
              </Trigger>
            </ControlTemplate.Triggers>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>
  </Window.Resources>

  <Border CornerRadius="9" Background="#F7F8F8" BorderBrush="#243134" BorderThickness="1" ClipToBounds="True">
    <Border.Effect><DropShadowEffect BlurRadius="34" ShadowDepth="9" Opacity="0.24" Color="#111D21"/></Border.Effect>
    <Grid>
      <Grid.RowDefinitions>
        <RowDefinition Height="36"/>
        <RowDefinition Height="280"/>
        <RowDefinition Height="184"/>
      </Grid.RowDefinitions>

      <Grid x:Name="TitleBar" Grid.Row="0" Background="#0B1214">
        <Grid.ColumnDefinitions><ColumnDefinition/><ColumnDefinition Width="36"/><ColumnDefinition Width="36"/></Grid.ColumnDefinitions>
        <StackPanel Orientation="Horizontal" VerticalAlignment="Center" Margin="16,0,0,0">
          <Image x:Name="TitleIcon" Width="17" Height="17" Margin="0,0,8,0"/>
          <TextBlock Text="Mineradio Next" Foreground="#E8EEEE" FontSize="10" FontWeight="SemiBold" VerticalAlignment="Center"/>
        </StackPanel>
        <Button Grid.Column="1" x:Name="MinimizeButton" Content="−" Style="{StaticResource WindowButtonStyle}"/>
        <Button Grid.Column="2" x:Name="CloseButton" Content="×" Style="{StaticResource WindowButtonStyle}" FontSize="15"/>
      </Grid>

      <Grid Grid.Row="1" Background="#101719" ClipToBounds="True">
        <Canvas x:Name="Soundfield" Width="780" Height="280" HorizontalAlignment="Left" VerticalAlignment="Top"/>
        <Rectangle IsHitTestVisible="False">
          <Rectangle.Fill>
            <LinearGradientBrush StartPoint="0,0.5" EndPoint="1,0.5">
              <GradientStop Color="#E605090A" Offset="0"/>
              <GradientStop Color="#5905090A" Offset="0.43"/>
              <GradientStop Color="#1405090A" Offset="0.76"/>
            </LinearGradientBrush>
          </Rectangle.Fill>
        </Rectangle>
        <StackPanel Orientation="Horizontal" VerticalAlignment="Top" HorizontalAlignment="Left" Margin="46,54,0,0">
          <Image x:Name="BrandIcon" Width="52" Height="52" Margin="0,0,14,0"/>
          <TextBlock Text="Mineradio Next" Foreground="#F4F7F6" FontSize="20" FontWeight="SemiBold" VerticalAlignment="Center"/>
        </StackPanel>
      </Grid>

      <Grid Grid.Row="2" Background="#F7F8F8">
        <Grid x:Name="WelcomePage" Margin="42,0">
          <Grid.ColumnDefinitions><ColumnDefinition/><ColumnDefinition Width="Auto"/><ColumnDefinition Width="20"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions>
          <StackPanel VerticalAlignment="Center">
            <TextBlock x:Name="WelcomeTitle" Text="安装 Mineradio Next" Foreground="#151B1D" FontSize="18" FontWeight="SemiBold"/>
            <TextBlock x:Name="WelcomeNote" Text="" Foreground="#6A7477" FontSize="10.5" Margin="0,9,0,0" Visibility="Collapsed"/>
          </StackPanel>
          <Button Grid.Column="1" x:Name="OpenOptionsButton" Content="安装设置" Style="{StaticResource TextButtonStyle}" VerticalAlignment="Center"/>
          <Button Grid.Column="3" x:Name="ContinueButton" Content="继续" Style="{StaticResource PrimaryButtonStyle}" VerticalAlignment="Center"/>
        </Grid>

        <Grid x:Name="OptionsPage" Margin="42,23,42,25" Visibility="Collapsed">
          <Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="42"/><RowDefinition Height="*"/></Grid.RowDefinitions>
          <TextBlock Text="安装设置" Foreground="#151B1D" FontSize="17" FontWeight="SemiBold"/>
          <Grid Grid.Row="1" Margin="0,16,0,0">
            <Grid.ColumnDefinitions><ColumnDefinition Width="36"/><ColumnDefinition/><ColumnDefinition Width="58"/></Grid.ColumnDefinitions>
            <Border Grid.ColumnSpan="3" Background="White" BorderBrush="#D6DDDE" BorderThickness="1" CornerRadius="5"/>
            <Path Grid.Column="0" Data="M 2,6 L 2,15 L 19,15 L 19,4 L 9,4 L 7,1 L 2,1 Z" Stretch="None" Stroke="#AAB5B7" StrokeThickness="1" HorizontalAlignment="Center" VerticalAlignment="Center"/>
            <TextBox Grid.Column="1" x:Name="PathBox" BorderThickness="0" Background="Transparent" Foreground="#465154" FontFamily="Segoe UI Variable Text, Segoe UI" FontSize="11" VerticalContentAlignment="Center" Padding="0"/>
            <Button Grid.Column="2" x:Name="BrowseButton" Content="更改" Background="#F8F9F9" Foreground="#4F5B5E" BorderBrush="#E3E8E9" BorderThickness="1,0,0,0" FontSize="11" FontWeight="Medium" Cursor="Hand"/>
          </Grid>
          <Grid Grid.Row="2" Margin="0,15,0,0">
            <Grid.ColumnDefinitions><ColumnDefinition/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions>
            <StackPanel Orientation="Horizontal" VerticalAlignment="Top">
              <StackPanel Orientation="Horizontal" Margin="0,0,26,0">
                <ToggleButton x:Name="DesktopShortcutToggle" IsChecked="True" Style="{StaticResource ToggleStyle}"/>
                <TextBlock Text="桌面快捷方式" Foreground="#465154" FontSize="11" FontWeight="Medium" VerticalAlignment="Center" Margin="9,0,0,0"/>
              </StackPanel>
              <StackPanel Orientation="Horizontal">
                <ToggleButton x:Name="LaunchToggle" IsChecked="True" Style="{StaticResource ToggleStyle}"/>
                <TextBlock Text="安装后启动" Foreground="#465154" FontSize="11" FontWeight="Medium" VerticalAlignment="Center" Margin="9,0,0,0"/>
              </StackPanel>
            </StackPanel>
            <StackPanel Grid.Column="1" Orientation="Horizontal" VerticalAlignment="Top">
              <Button x:Name="BackButton" Content="返回" Style="{StaticResource TextButtonStyle}" Margin="0,0,18,0"/>
              <Button x:Name="InstallButton" Content="安装" Style="{StaticResource PrimaryButtonStyle}"/>
            </StackPanel>
            <TextBlock x:Name="PathError" Grid.ColumnSpan="2" Foreground="#B3453E" FontSize="10" VerticalAlignment="Bottom" TextAlignment="Right"/>
          </Grid>
        </Grid>

        <Grid x:Name="ProgressPage" Margin="42,0" Visibility="Collapsed">
          <StackPanel VerticalAlignment="Center">
            <Grid>
              <TextBlock x:Name="ProgressTitle" Text="正在安装 Mineradio Next" Foreground="#151B1D" FontSize="17" FontWeight="SemiBold" VerticalAlignment="Center"/>
              <TextBlock x:Name="ProgressPercent" Text="0%" Foreground="#253033" FontSize="26" FontWeight="Normal" HorizontalAlignment="Right" VerticalAlignment="Center"/>
            </Grid>
            <Grid x:Name="ProgressTrack" Height="4" Background="#DCE2E3" Margin="0,27,0,0" ClipToBounds="True">
              <Border x:Name="ProgressFill" Width="0" HorizontalAlignment="Left">
                <Border.Background>
                  <LinearGradientBrush StartPoint="0,0" EndPoint="1,0"><GradientStop Color="#55DDB5"/><GradientStop Color="#58C9E8" Offset="1"/></LinearGradientBrush>
                </Border.Background>
              </Border>
            </Grid>
          </StackPanel>
        </Grid>

        <Grid x:Name="CompletePage" Margin="42,0" Visibility="Collapsed">
          <Grid.ColumnDefinitions><ColumnDefinition/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions>
          <StackPanel Orientation="Horizontal" VerticalAlignment="Center">
            <Path x:Name="CompleteIcon" Data="M 2,8 L 7,13 L 17,2" Stretch="None" Stroke="#20A586" StrokeThickness="2" StrokeStartLineCap="Round" StrokeEndLineCap="Round" Margin="3,0,16,0"/>
            <TextBlock x:Name="CompleteTitle" Text="安装完成" Foreground="#151B1D" FontSize="17" FontWeight="SemiBold" VerticalAlignment="Center"/>
          </StackPanel>
          <Button Grid.Column="1" x:Name="FinishButton" Content="完成" Style="{StaticResource PrimaryButtonStyle}" VerticalAlignment="Center"/>
        </Grid>
      </Grid>
    </Grid>
  </Border>
</Window>
'@

$reader = New-Object System.Xml.XmlNodeReader $xaml
$window = [Windows.Markup.XamlReader]::Load($reader)

function Find-Control([string]$Name) { return $window.FindName($Name) }

$titleBar = Find-Control 'TitleBar'
$minimizeButton = Find-Control 'MinimizeButton'
$closeButton = Find-Control 'CloseButton'
$openOptionsButton = Find-Control 'OpenOptionsButton'
$continueButton = Find-Control 'ContinueButton'
$welcomePage = Find-Control 'WelcomePage'
$optionsPage = Find-Control 'OptionsPage'
$progressPage = Find-Control 'ProgressPage'
$completePage = Find-Control 'CompletePage'
$pathBox = Find-Control 'PathBox'
$pathError = Find-Control 'PathError'
$browseButton = Find-Control 'BrowseButton'
$backButton = Find-Control 'BackButton'
$installButton = Find-Control 'InstallButton'
$desktopShortcutToggle = Find-Control 'DesktopShortcutToggle'
$launchToggle = Find-Control 'LaunchToggle'
$progressTrack = Find-Control 'ProgressTrack'
$progressFill = Find-Control 'ProgressFill'
$progressPercent = Find-Control 'ProgressPercent'
$completeIcon = Find-Control 'CompleteIcon'
$completeTitle = Find-Control 'CompleteTitle'
$finishButton = Find-Control 'FinishButton'
$soundfield = Find-Control 'Soundfield'
$welcomeTitle = Find-Control 'WelcomeTitle'
$welcomeNote = Find-Control 'WelcomeNote'
$progressTitle = Find-Control 'ProgressTitle'

$pathBox.Text = $(if ($Uninstall -and -not [string]::IsNullOrWhiteSpace($InstallPath)) { $InstallPath } else { Get-DetectedInstallPath })

if ($Uninstall) {
  $window.Title = 'Mineradio Next 卸载程序'
  $welcomeTitle.Text = '卸载 Mineradio Next'
  $welcomeNote.Text = '歌单、账号与播放器设置将保留'
  $welcomeNote.Visibility = 'Visible'
  $openOptionsButton.Content = '暂不卸载'
  $continueButton.Content = '卸载'
  $progressTitle.Text = '正在卸载 Mineradio Next'
  $completeTitle.Text = '卸载完成'
}

$icon = [System.Drawing.Icon]::ExtractAssociatedIcon($InstallerPath)
if ($null -ne $icon) {
  $bitmap = $icon.ToBitmap()
  $stream = New-Object System.IO.MemoryStream
  $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  $stream.Position = 0
  $source = New-Object System.Windows.Media.Imaging.BitmapImage
  $source.BeginInit()
  $source.CacheOption = [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad
  $source.StreamSource = $stream
  $source.EndInit()
  (Find-Control 'TitleIcon').Source = $source
  (Find-Control 'BrandIcon').Source = $source
  $window.Icon = $source
  $stream.Dispose()
  $bitmap.Dispose()
  $icon.Dispose()
}

$brushConverter = New-Object Windows.Media.BrushConverter
for ($ring = 0; $ring -lt 16; $ring += 1) {
  $diameter = (34 + $ring * 14) * 2
  $ellipse = New-Object System.Windows.Shapes.Ellipse
  $ellipse.Width = $diameter
  $ellipse.Height = $diameter
  $ellipse.StrokeThickness = $(if ($ring % 4 -eq 0) { 1.2 } else { 0.65 })
  $ellipse.Stroke = $brushConverter.ConvertFromString($(if ($ring % 3 -eq 0) { '#3858C9E8' } else { '#3055DDB5' }))
  [System.Windows.Controls.Canvas]::SetLeft($ellipse, 562 - $diameter / 2)
  [System.Windows.Controls.Canvas]::SetTop($ellipse, 151 - $diameter / 2)
  $soundfield.Children.Add($ellipse) | Out-Null
}

$fieldLines = @()
for ($line = 0; $line -lt 34; $line += 1) {
  $polyline = New-Object System.Windows.Shapes.Polyline
  $polyline.StrokeThickness = $(if ($line % 9 -eq 0) { 1.15 } else { 0.65 })
  $polyline.Stroke = $brushConverter.ConvertFromString($(if ($line % 4 -eq 0) { '#2258C9E8' } else { '#2055DDB5' }))
  $soundfield.Children.Add($polyline) | Out-Null
  $fieldLines += $polyline
}

$script:fieldPhase = 0.0
function Update-Soundfield {
  for ($line = 0; $line -lt $fieldLines.Count; $line += 1) {
    $points = New-Object Windows.Media.PointCollection
    $baseX = 335 + $line * 13
    $amplitude = 18 + [Math]::Sin($line * 0.71 + $script:fieldPhase) * 23
    for ($y = 12; $y -le 268; $y += 6) {
      $displacement = [Math]::Sin($y * 0.045 + $line * 0.28 + $script:fieldPhase) * $amplitude * [Math]::Sin([Math]::PI * $y / 280)
      $points.Add((New-Object Windows.Point(($baseX + $displacement), $y)))
    }
    $fieldLines[$line].Points = $points
  }
}
Update-Soundfield

$fieldTimer = New-Object System.Windows.Threading.DispatcherTimer
$fieldTimer.Interval = [TimeSpan]::FromMilliseconds(50)
$fieldTimer.Add_Tick({ $script:fieldPhase += 0.035; Update-Soundfield })
if (-not $reduceMotion) { $fieldTimer.Start() }

function Show-Page {
  param([Windows.FrameworkElement]$Next)
  foreach ($page in @($welcomePage, $optionsPage, $progressPage, $completePage)) { $page.Visibility = 'Collapsed' }
  $Next.Visibility = 'Visible'
  if (-not $reduceMotion) {
    $Next.Opacity = 0
    $translate = New-Object Windows.Media.TranslateTransform
    $translate.Y = 5
    $Next.RenderTransform = $translate
    $Next.BeginAnimation([Windows.UIElement]::OpacityProperty, (New-Object Windows.Media.Animation.DoubleAnimation(0, 1, [TimeSpan]::FromMilliseconds(220))))
    $translate.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, (New-Object Windows.Media.Animation.DoubleAnimation(5, 0, [TimeSpan]::FromMilliseconds(220))))
  }
}

function Set-ProgressVisual {
  param([int]$Value)
  $bounded = [Math]::Max(0, [Math]::Min(100, $Value))
  $progressPercent.Text = "$bounded%"
  $trackWidth = $progressTrack.ActualWidth
  if ($trackWidth -le 0) { $trackWidth = 696 }
  $progressFill.Width = $trackWidth * $bounded / 100
}

if ($ValidateOnly) {
  $fieldTimer.Stop()
  Write-Output $(if ($Uninstall) { 'Mineradio uninstaller shell validation passed' } else { 'Mineradio installer shell validation passed' })
  return
}

$titleBar.Add_MouseLeftButtonDown({ if ($_.ButtonState -eq 'Pressed') { $window.DragMove() } })
$minimizeButton.Add_Click({ $window.WindowState = 'Minimized' })
$closeButton.Add_Click({ if ($null -eq $script:installerProcess -or $script:installerProcess.HasExited) { $window.Close() } })
$openOptionsButton.Add_Click({
  if ($Uninstall) { $window.Close() } else { Show-Page -Next $optionsPage }
})
$backButton.Add_Click({ $pathError.Text = ''; Show-Page -Next $welcomePage })
$browseButton.Add_Click({
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = '选择 Mineradio Next 的上级文件夹'
  $dialog.ShowNewFolderButton = $true
  $current = $pathBox.Text.Trim()
  if (Test-Path -LiteralPath $current) { $dialog.SelectedPath = $current }
  if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    $selected = $dialog.SelectedPath.TrimEnd('\')
    if ((Split-Path -Leaf $selected) -notin @('Mineradio-Next', 'Mineradio')) {
      $selected = Join-Path $selected 'Mineradio-Next'
    }
    $pathBox.Text = $selected
    $pathError.Text = ''
  }
  $dialog.Dispose()
})

$script:installerProcess = $null
$script:processTimer = $null
$script:shellExitCode = 2
$script:visualProgress = 0
$script:progressTicks = 0
$script:beginUninstall = {
  Show-Page -Next $progressPage
  $closeButton.IsEnabled = $false
  $minimizeButton.IsEnabled = $false
  $script:visualProgress = 4
  $script:progressTicks = 0
  Set-ProgressVisual -Value $script:visualProgress

  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $InstallerPath
  $startInfo.Arguments = '/S /MINERADIO-UNINSTALL-SHELL'
  $startInfo.UseShellExecute = $true
  try {
    $script:installerProcess = [System.Diagnostics.Process]::Start($startInfo)
  } catch {
    $script:shellExitCode = 1
    $closeButton.IsEnabled = $true
    $minimizeButton.IsEnabled = $true
    $completeIcon.Visibility = 'Collapsed'
    $completeTitle.Text = '卸载未完成'
    $finishButton.Content = '关闭'
    Show-Page -Next $completePage
    return
  }

  $script:processTimer = New-Object System.Windows.Threading.DispatcherTimer
  $script:processTimer.Interval = [TimeSpan]::FromMilliseconds(180)
  $script:processTimer.Add_Tick({
    $script:progressTicks += 1
    if ($script:visualProgress -lt 68) {
      $script:visualProgress += 1
    } elseif ($script:visualProgress -lt 90 -and $script:progressTicks % 4 -eq 0) {
      $script:visualProgress += 1
    }
    Set-ProgressVisual -Value $script:visualProgress

    if ($null -eq $script:installerProcess -or -not $script:installerProcess.HasExited) { return }
    $script:processTimer.Stop()
    $closeButton.IsEnabled = $true
    $minimizeButton.IsEnabled = $true
    if ($script:installerProcess.ExitCode -eq 0) {
      $script:shellExitCode = 0
      Set-ProgressVisual -Value 100
      $completeIcon.Visibility = 'Visible'
      $completeTitle.Text = '卸载完成'
      $finishButton.Content = '完成'
    } else {
      $script:shellExitCode = $script:installerProcess.ExitCode
      $completeIcon.Visibility = 'Collapsed'
      $completeTitle.Text = "卸载未完成（代码 $($script:installerProcess.ExitCode)）"
      $finishButton.Content = '关闭'
    }
    Show-Page -Next $completePage
  })
  $script:processTimer.Start()
}
$continueButton.Add_Click({
  if ($Uninstall) { & $script:beginUninstall } else { Show-Page -Next $optionsPage }
})
$installButton.Add_Click({
  $target = $pathBox.Text.Trim().TrimEnd('\')
  $validationError = Test-InstallPath -Path $target
  if ($null -ne $validationError) {
    $pathError.Text = $validationError
    return
  }

  $pathError.Text = ''
  Show-Page -Next $progressPage
  $closeButton.IsEnabled = $false
  $minimizeButton.IsEnabled = $false
  $script:visualProgress = 4
  $script:progressTicks = 0
  Set-ProgressVisual -Value $script:visualProgress

  $arguments = @('/S', '/MINERADIO-SHELL')
  if (-not [bool]$desktopShortcutToggle.IsChecked) { $arguments += '/MINERADIO-NO-DESKTOP' }
  $arguments += "/D=$target"

  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $InstallerPath
  $startInfo.Arguments = $arguments -join ' '
  $startInfo.UseShellExecute = $true
  try {
    $script:installerProcess = [System.Diagnostics.Process]::Start($startInfo)
  } catch {
    $script:shellExitCode = 1
    $closeButton.IsEnabled = $true
    $minimizeButton.IsEnabled = $true
    $completeIcon.Visibility = 'Collapsed'
    $completeTitle.Text = '安装未完成'
    $finishButton.Content = '关闭'
    Show-Page -Next $completePage
    return
  }

  $script:processTimer = New-Object System.Windows.Threading.DispatcherTimer
  $script:processTimer.Interval = [TimeSpan]::FromMilliseconds(180)
  $script:processTimer.Add_Tick({
    $script:progressTicks += 1
    if ($script:visualProgress -lt 68) {
      $script:visualProgress += 1
    } elseif ($script:visualProgress -lt 90 -and $script:progressTicks % 4 -eq 0) {
      $script:visualProgress += 1
    }
    Set-ProgressVisual -Value $script:visualProgress

    if ($null -eq $script:installerProcess -or -not $script:installerProcess.HasExited) { return }
    $script:processTimer.Stop()
    $closeButton.IsEnabled = $true
    $minimizeButton.IsEnabled = $true
    if ($script:installerProcess.ExitCode -eq 0) {
      $script:shellExitCode = 0
      Set-ProgressVisual -Value 100
      $completeIcon.Visibility = 'Visible'
      $completeTitle.Text = '安装完成'
      $finishButton.Content = '完成'
    } else {
      $script:shellExitCode = $script:installerProcess.ExitCode
      $completeIcon.Visibility = 'Collapsed'
      $completeTitle.Text = "安装未完成（代码 $($script:installerProcess.ExitCode)）"
      $finishButton.Content = '关闭'
    }
    Show-Page -Next $completePage
  })
  $script:processTimer.Start()
})

$finishButton.Add_Click({
  if (-not $Uninstall -and $null -ne $script:installerProcess -and $script:installerProcess.ExitCode -eq 0 -and [bool]$launchToggle.IsChecked) {
    $target = $pathBox.Text.Trim().TrimEnd('\')
    $appPath = Join-Path $target 'Mineradio-Next.exe'
    if (Test-Path -LiteralPath $appPath) { Start-Process -FilePath $appPath }
  }
  $window.Close()
})

$window.Add_Closed({
  $fieldTimer.Stop()
  if ($null -ne $script:processTimer) { $script:processTimer.Stop() }
  if ($null -ne $shellMutex) {
    try { $shellMutex.ReleaseMutex() } catch {}
    $shellMutex.Dispose()
  }
})
$window.Add_Closing({
  param($sender, $eventArgs)
  if ($null -ne $script:installerProcess -and -not $script:installerProcess.HasExited) {
    $eventArgs.Cancel = $true
  }
})
$window.ShowDialog() | Out-Null
exit $script:shellExitCode
