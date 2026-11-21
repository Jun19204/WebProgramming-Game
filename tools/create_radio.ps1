# Optional authoring only. Game playback is fully offline.
# Regenerate sends only the four scripted lines to Microsoft Edge TTS.
param([string]$Ffmpeg, [switch]$Regenerate, [string]$Python = 'python')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$voiceFolder = Join-Path $projectRoot 'assets/voices'
if (!$Ffmpeg) { throw 'Pass -Ffmpeg with the path to an authoring ffmpeg executable.' }
$clips = @(
 @{Key='inbound'; Text='Five bandits inbound. Good hunting.'; Voice='en-US-ChristopherNeural'; Rate='-8%'; Pitch='-4Hz'},
 @{Key='victory'; Text='All targets neutralized. Good work, SpearOne!'; Voice='en-US-ChristopherNeural'; Rate='-8%'; Pitch='-4Hz'},
 @{Key='hit1'; Text="Gah! I'm hit!"; Voice='en-US-GuyNeural'; Rate='+18%'; Pitch='+9Hz'},
 @{Key='hit2'; Text='Damn it, taking fire!'; Voice='en-US-GuyNeural'; Rate='+22%'; Pitch='+12Hz'}
)
$entries = @()
foreach ($clip in $clips) {
 $mp3 = Join-Path $voiceFolder ($clip.Key + '.mp3')
 $wav = Join-Path $voiceFolder ($clip.Key + '.wav')
 if ($Regenerate) {
  & $Python -m edge_tts --voice $clip.Voice "--rate=$($clip.Rate)" "--pitch=$($clip.Pitch)" --text $clip.Text --write-media $mp3
  if ($LASTEXITCODE -ne 0) { throw "Speech generation failed: $($clip.Key)" }
 }
 # Close microphone compression plus a quiet, band-limited carrier hiss.
 $filter = '[0:a]silenceremove=start_periods=1:start_threshold=-48dB,highpass=f=280,lowpass=f=3400,acompressor=threshold=0.09:ratio=4:attack=3:release=70:makeup=2,adelay=55,apad=pad_dur=0.09[v];anoisesrc=color=white:amplitude=0.009:sample_rate=22050,highpass=f=500,lowpass=f=3000[n];[v][n]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.85:level=false[out]'
 & $Ffmpeg -hide_banner -loglevel error -y -i $mp3 -filter_complex $filter -map '[out]' -ar 22050 -ac 1 -c:a pcm_s16le $wav
 if ($LASTEXITCODE -ne 0) { throw "PCM conversion failed: $($clip.Key)" }
 # Squelch opening/closing crackle inside the clip: pauses cancel it with speech.
 $bytes = [IO.File]::ReadAllBytes($wav)
 $rng = [Random]::new(417)
 for ($offset=12; $offset+8 -le $bytes.Length;) {
  $length = [BitConverter]::ToInt32($bytes,$offset+4)
  if ([Text.Encoding]::ASCII.GetString($bytes,$offset,4) -eq 'data') {
   $frames = [int]($length/2)
   for ($i=0; $i -lt $frames; $i++) {
    $edge = [Math]::Max([Math]::Max(0,1-$i/900.0),[Math]::Max(0,1-($frames-1-$i)/1200.0))
    if ($edge -le 0) { continue }
    $index = $offset+8+$i*2
    $sample = [BitConverter]::ToInt16($bytes,$index) + ($rng.NextDouble()*2-1)*1800*$edge
    $sample = [int16][Math]::Clamp($sample,-32767,32767)
    $pair = [BitConverter]::GetBytes($sample)
    $bytes[$index]=$pair[0];$bytes[$index+1]=$pair[1]
   }
   break
  }
  $offset += 8+$length+($length%2)
 }
 [IO.File]::WriteAllBytes($wav,$bytes)
 $entries += ($clip.Key + ": '" + [Convert]::ToBase64String([IO.File]::ReadAllBytes($wav)) + "'")
}
$script = "(function(){'use strict';window.SkyStrike=window.SkyStrike||{};window.SkyStrike.radioCast={controller:'en-US-ChristopherNeural',pilot:'en-US-GuyNeural'};window.SkyStrike.radioData={" + ($entries -join ',') + "};})();"
[IO.File]::WriteAllText((Join-Path $projectRoot 'assets/radio.js'), $script)
Write-Output 'Two distinct male voices / four offline radio clips embedded.'
