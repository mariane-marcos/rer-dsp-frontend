export type DownloadFormatCode = 'csv' | string

export type DownloadAvailabilityStatus = 'available' | 'unavailable'

export interface DownloadThemeDTO {
  code: string
  name: string
  formats: DownloadFormatCode[]
  enabled: boolean
}

export interface DownloadFormatStatusDTO {
  format: DownloadFormatCode
  status: DownloadAvailabilityStatus
}

export interface DownloadItemDTO {
  themeCode: string
  themeName: string
  formats: DownloadFormatStatusDTO[]
  lastUpdate: string | null
  lastFileGenerated: string | null
}

export interface DownloadSearchFilterDTO {
  level1?: string | null
  level2: string
  level3?: string | null
  theme?: string | null
}
