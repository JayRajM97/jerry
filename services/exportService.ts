/**
 * Client for the server-side PDF export. The server lays the HTML out with the
 * shared resume stylesheet, shrinks it to one page if it must, and reports how
 * it fitted in response headers so the UI can say so.
 */

export interface ExportFit {
  pages: number;
  scale: number;
  fits: boolean;
  fill: number;
}

export interface ExportResult extends ExportFit {
  filename: string;
  blob: Blob;
}

export async function exportResumePdf(html: string, filename: string): Promise<ExportResult> {
  const res = await fetch('/api/export/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html, filename }),
  });

  if (!res.ok) {
    let message = `PDF export failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch { /* keep status message */ }
    throw new Error(message);
  }

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const served = /filename="([^"]+)"/.exec(disposition)?.[1];

  return {
    blob,
    filename: served || filename,
    pages: Number(res.headers.get('X-Resume-Pages') || '1'),
    scale: Number(res.headers.get('X-Resume-Scale') || '1'),
    fits: res.headers.get('X-Resume-Fits') !== 'false',
    fill: Number(res.headers.get('X-Resume-Fill') || '0'),
  };
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
