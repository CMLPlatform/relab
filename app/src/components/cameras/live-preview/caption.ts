export function getLivePreviewCaption(
  isLocalStream: boolean,
): 'Live preview · Direct · <1s' | 'Live preview · LL-HLS' {
  return isLocalStream ? 'Live preview · Direct · <1s' : 'Live preview · LL-HLS';
}
