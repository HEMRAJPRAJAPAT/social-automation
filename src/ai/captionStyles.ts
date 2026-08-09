export type CaptionStylePreset = 'bold-highlight' | 'clean-white';

interface AssStyleParams {
  fontSize: number;
  /** Color of a word AFTER it has been spoken (ASS PrimaryColour), &HBBGGRR. */
  spokenColor: string;
  /** Color of a word BEFORE it has been spoken (ASS SecondaryColour), &HBBGGRR. */
  upcomingColor: string;
  outlineColor: string;
  backColor: string;
  outline: number;
  shadow: number;
  marginV: number;
}

const PRESETS: Record<CaptionStylePreset, AssStyleParams> = {
  // Large, high-energy: words pop to gold as they're spoken — the
  // TikTok/Reels-native "progressive keyword highlight" look.
  'bold-highlight': {
    fontSize: 84,
    spokenColor: '&H0000D7FF', // gold
    upcomingColor: '&H00FFFFFF', // white
    outlineColor: '&H00000000',
    backColor: '&H80000000',
    outline: 4,
    shadow: 2,
    marginV: 220,
  },
  // Static, understated: no karaoke pop (spoken == upcoming color).
  'clean-white': {
    fontSize: 68,
    spokenColor: '&H00FFFFFF',
    upcomingColor: '&H00FFFFFF',
    outlineColor: '&H00000000',
    backColor: '&H64000000',
    outline: 2,
    shadow: 1,
    marginV: 180,
  },
};

const PLAY_RES_X = 1080;
const PLAY_RES_Y = 1920;

export function resolveCaptionStylePreset(preset: string): CaptionStylePreset {
  return preset === 'clean-white' ? 'clean-white' : 'bold-highlight';
}

/** Builds the `[Script Info]` + `[V4+ Styles]` blocks of an .ass subtitle file. */
export function buildAssHeader(fontFamily: string, preset: CaptionStylePreset): string {
  const p = PRESETS[preset];
  return `[Script Info]
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.601
PlayResX: ${PLAY_RES_X}
PlayResY: ${PLAY_RES_Y}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontFamily},${p.fontSize},${p.spokenColor},${p.upcomingColor},${p.outlineColor},${p.backColor},-1,0,0,0,100,100,0,0,1,${p.outline},${p.shadow},2,60,60,${p.marginV},1`;
}
