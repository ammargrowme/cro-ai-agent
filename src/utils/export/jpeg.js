/**
 * JPEG screenshot export.
 * Uses html2canvas (lazy-loaded) to capture the dashboard as a JPEG image.
 */
export const exportJPEG = async (elementRef, url) => {
  if (!elementRef?.current) throw new Error("No element to capture");

  const { default: html2canvas } = await import('html2canvas');
  const canvas = await html2canvas(elementRef.current, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#08090D',
    logging: false,
    windowWidth: 1200
  });

  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/jpeg', 0.92);
  a.download = `GrowAgent_${new URL(url).hostname}_CRO_Report.jpg`;
  a.click();
};
