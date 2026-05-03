/**
 * Pick Doctor vs Patient microphones from enumerateDevices() labels.
 * Headset / USB comms → clinician; built-in / array → room / patient.
 */

export type AudioDevicePick = { deviceId: string; label: string }

/** Likely clinician headset, USB mic, BT hands-free, etc. */
const CLINICIAN_RE =
  /headset|headphone|earphone|earbuds|airpods|bluetooth|hands-?free|jabra|plantronics|\bpoly\b|corsair|hyperx|steelseries|communications|mono\s+mic|wireless\s+mic|usb\s+(audio|headset|mic)|logitech\s+usb/i

/** Likely laptop / room capture */
const ROOM_RE =
  /built[- ]?in|internal|microphone\s+array|\barray\b|realtek|macbook|laptop|integrated|stereo\s+mix|surface/i

function clinicianScore(label: string): number {
  const l = (label || '').toLowerCase()
  let s = 0
  if (CLINICIAN_RE.test(l)) s += 4
  if (/^usb\b|\busb\s/i.test(l) && !ROOM_RE.test(l)) s += 2
  if (ROOM_RE.test(l)) s -= 3
  return s
}

function roomScore(label: string): number {
  const l = (label || '').toLowerCase()
  let s = 0
  if (ROOM_RE.test(l)) s += 4
  if (/default/i.test(l)) s += 1
  if (CLINICIAN_RE.test(l)) s -= 2
  return s
}

/**
 * Returns doctor + patient deviceIds when at least two distinct inputs exist.
 */
/** Avoid pairing before Chrome attaches real labels (permission / enumerate refresh). */
export function shouldAutoInferDualMic(devices: AudioDevicePick[]): boolean {
  if (devices.length < 2) return false
  const usable = devices.filter(d => d.deviceId && d.deviceId !== '')
  if (usable.length < 2) return false
  return usable.some(d => CLINICIAN_RE.test(d.label || '') || ROOM_RE.test(d.label || ''))
}

export function inferDualMicDefaults(devices: AudioDevicePick[]): { doctorId: string; patientId: string } | null {
  const usable = devices.filter(d => d.deviceId && d.deviceId !== '')
  if (usable.length < 2) return null

  const byDoctor = [...usable].sort(
    (a, b) => clinicianScore(b.label) - clinicianScore(a.label),
  )
  const doctorId = byDoctor[0].deviceId

  const rest = usable.filter(d => d.deviceId !== doctorId)
  if (!rest.length) return null

  const byRoom = [...rest].sort((a, b) => roomScore(b.label) - roomScore(a.label))
  const patientId = byRoom[0].deviceId

  if (!patientId || patientId === doctorId) return null
  return { doctorId, patientId }
}
