import { Disclosure, RangeField, SelectField, Segmented, SwitchField } from '@/components/ui/primitives'
import { CRF_RANGE, PRESETS, clampCrf, codecsForContainer, presetById, qualityAdjective } from '@/lib/video/presets'
import { buildVideoArgs, describeCommand } from '@/lib/video/args'
import type {
  AudioCodec,
  MediaProbe,
  ResolutionId,
  VideoContainer,
  VideoPresetId,
  VideoSettings,
  X264Preset,
} from '@/types/media'

interface Props {
  settings: VideoSettings
  /** First video in the queue, used to render the real command that will run. */
  sample: MediaProbe | null
  onChange: (patch: Partial<VideoSettings>) => void
}

const RESOLUTION_OPTIONS: readonly { value: ResolutionId; label: string }[] = [
  { value: 'source', label: 'Keep source resolution' },
  { value: '2160', label: '2160p' },
  { value: '1440', label: '1440p' },
  { value: '1080', label: '1080p' },
  { value: '720', label: '720p' },
  { value: '480', label: '480p' },
  { value: '360', label: '360p' },
]

const FPS_OPTIONS = [
  { value: 'keep', label: 'Keep source frame rate' },
  { value: '60', label: '60 fps' },
  { value: '50', label: '50 fps' },
  { value: '30', label: '30 fps' },
  { value: '24', label: '24 fps' },
]

const AUDIO_OPTIONS = [
  { value: '192', label: '192 kbps' },
  { value: '128', label: '128 kbps' },
  { value: '96', label: '96 kbps' },
  { value: '64', label: '64 kbps' },
  { value: 'off', label: 'Remove the audio track' },
]

const X264_OPTIONS: readonly { value: X264Preset; label: string }[] = [
  { value: 'ultrafast', label: 'ultrafast — least CPU' },
  { value: 'veryfast', label: 'veryfast' },
  { value: 'faster', label: 'faster' },
  { value: 'medium', label: 'medium' },
  { value: 'slow', label: 'slow' },
  { value: 'veryslow', label: 'veryslow — most CPU' },
]

export function VideoSettingsPanel({ settings, sample, onChange }: Props) {
  const range = CRF_RANGE[settings.videoCodec]
  const crf = clampCrf(settings.videoCodec, settings.crf)
  const isVp8 = settings.videoCodec === 'libvpx'

  /** Any manual change moves the selector to Custom so the label stays truthful. */
  const edit = (patch: Partial<VideoSettings>) => onChange({ ...patch, presetId: 'custom' })

  const setContainer = (container: VideoContainer) => {
    const codecs = codecsForContainer(container)
    edit({
      container,
      videoCodec: codecs.video,
      audioCodec: settings.audioCodec === null ? null : codecs.audio,
      crf: clampCrf(codecs.video, settings.crf),
    })
  }

  const command = sample
    ? describeCommand(
        buildVideoArgs({
          inputPath: 'input.mp4',
          outputPath: 'output.' + (settings.container === 'webm' ? 'webm' : 'mp4'),
          settings,
          source: sample.dimensions,
        }),
      )
    : null

  return (
    <div className="space-y-4">
      <Segmented<VideoPresetId>
        label="Preset"
        value={settings.presetId}
        options={PRESETS.map((preset) => ({ value: preset.id, label: preset.label }))}
        onChange={(value) => onChange({ ...presetById(value).settings })}
      />
      <p className="-mt-2 text-2xs text-ink-3">
        {presetById(settings.presetId).description}
      </p>

      <RangeField
        label="Quality"
        value={crf}
        min={range.min}
        max={range.max}
        valueLabel={`CRF ${crf} · ${qualityAdjective(settings.videoCodec, crf)}`}
        hint={`${settings.videoCodec} uses CRF ${range.min}–${range.max}. Lower keeps more detail and produces a larger file.`}
        onChange={(value) => edit({ crf: value })}
      />

      <SelectField
        label="Resolution"
        value={settings.resolution}
        options={RESOLUTION_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        hint="A source already at or below the cap is not scaled up."
        onChange={(value) => edit({ resolution: value as ResolutionId })}
      />

      <SelectField
        label="Frame rate"
        value={settings.fps === null ? 'keep' : String(settings.fps)}
        options={FPS_OPTIONS}
        onChange={(value) => edit({ fps: value === 'keep' ? null : Number(value) })}
      />

      <SelectField
        label="Audio"
        value={settings.audioCodec === null ? 'off' : String(settings.audioBitrateKbps ?? 128)}
        options={AUDIO_OPTIONS}
        hint={
          settings.audioCodec === null
            ? 'The track is removed entirely with -an.'
            : `Encoded with ${settings.audioCodec === 'libopus' ? 'Opus' : 'AAC'}.`
        }
        onChange={(value) => {
          if (value === 'off') {
            edit({ audioCodec: null, audioBitrateKbps: null })
            return
          }
          edit({
            audioCodec: (isVp8 ? 'libopus' : 'aac') as AudioCodec,
            audioBitrateKbps: Number(value),
          })
        }}
      />

      <Disclosure label="Container and encoder">
        <SelectField
          label="Output format"
          value={settings.container}
          options={[
            { value: 'mp4', label: 'MP4 — H.264 + AAC' },
            { value: 'webm', label: 'WebM — VP8 + Opus' },
          ]}
          hint="MP4 plays everywhere. WebM is offered with VP8 because the VP9 encoder in this core build aborts mid-encode."
          onChange={(value) => setContainer(value as VideoContainer)}
        />

        {isVp8 ? (
          <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-2xs text-ink-2">
            VP8 runs with -cpu-used 4 and no speed presets of its own. At the same CRF it usually lands
            between 10% and 30% larger than H.264 for the same clip.
          </p>
        ) : (
          <SelectField
            label="x264 speed preset"
            value={settings.x264Preset}
            options={X264_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            hint="Slower presets spend more CPU per frame to reach the same CRF at fewer bytes."
            onChange={(value) => edit({ x264Preset: value as X264Preset })}
          />
        )}

        {settings.container === 'mp4' ? (
          <SwitchField
            label="Fast start (moov atom at the front)"
            checked={settings.fastStart}
            hint="Adds -movflags +faststart so playback can begin before the whole file downloads."
            onChange={(checked) => edit({ fastStart: checked })}
          />
        ) : null}

        {command && sample ? (
          <div>
            <p className="field-label">Command for {sample.name}</p>
            <pre className="overflow-x-auto rounded-lg border border-line bg-surface-2 p-3 font-mono text-2xs leading-relaxed text-ink-2">
              {command}
            </pre>
          </div>
        ) : (
          <p className="text-2xs text-ink-3">
            Add a video to see the exact ffmpeg command that will run.
          </p>
        )}
      </Disclosure>
    </div>
  )
}
