import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { DEFAULT_SETTINGS, mergeSettings, type AppSettings, type SettingsPatch } from '@shared/settings'

export const settingsSlice = createSlice({
  name: 'settings',
  initialState: DEFAULT_SETTINGS,
  reducers: {
    settingsLoaded: (_s, a: PayloadAction<AppSettings>) => a.payload,
    settingsPatched: (s, a: PayloadAction<SettingsPatch>) => mergeSettings(s, a.payload)
  }
})

export const { settingsLoaded, settingsPatched } = settingsSlice.actions

/** Optimistically apply locally, then persist in main (which broadcasts the final value). */
export const updateSettings = createAsyncThunk('settings/update', async (patch: SettingsPatch, { dispatch }) => {
  dispatch(settingsPatched(patch))
  const saved = await window.app.setSettings(patch)
  dispatch(settingsLoaded(saved))
  return saved
})
