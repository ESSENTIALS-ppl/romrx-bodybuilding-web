import { ResultsPreview } from './ResultsPreview'

// PREVIEW ONLY. Route exists only when the build sets VITE_PREVIEW_HARNESS=on (never set for production).
// Mock Base-active user and one assessment, so Field can click the real ?add=bodybuilding button without sign-in.
// Values are a test fixture, not user data.
const MOCK_ASSESSMENT = {
  hip_er_l: 38, hip_er_r: 44, hip_ir_l: 30, hip_ir_r: 33, hip_abd_l: 40, hip_abd_r: 42,
  shoulder_er_l: 80, shoulder_er_r: 86, shoulder_flex_l: 165, shoulder_flex_r: 170,
  ankle_df_l: 9, ankle_df_r: 11, cervical_lat_l: 40, cervical_lat_r: 42,
  cervical_flex: 50, cervical_ext: 55, lumbar_flex: 60, lumbar_ext: 25,
  assessed_at: '2026-10-19T21:00:00Z',
}

export function PreviewPaywall() {
  return <ResultsPreview mock={{ assessment: MOCK_ASSESSMENT, baseActive: true }} />
}
