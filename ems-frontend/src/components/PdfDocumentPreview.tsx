'use client';

import { useEffect, useState } from 'react';

type PdfDocumentPreviewProps = {
  url: string;
  title: string;
  className?: string;
};

function createPdfObjectUrl(dataUrl: string) {
  const separatorIndex = dataUrl.indexOf(',');
  if (separatorIndex < 0) {
    return null;
  }

  try {
    const bytes = atob(dataUrl.slice(separatorIndex + 1));
    const buffer = new Uint8Array(bytes.length);
    for (let index = 0; index < bytes.length; index += 1) {
      buffer[index] = bytes.charCodeAt(index);
    }
    return URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' }));
  } catch {
    return null;
  }
}

export function PdfDocumentPreview({ url, title, className }: PdfDocumentPreviewProps) {
  const [generatedPreview, setGeneratedPreview] = useState<{
    source: string;
    url: string;
  } | null>(null);

  useEffect(() => {
    if (!url.startsWith('data:application/pdf')) {
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    async function preparePreview() {
      await Promise.resolve();
      if (cancelled) {
        return;
      }

      objectUrl = createPdfObjectUrl(url);
      if (objectUrl) {
        setGeneratedPreview({ source: url, url: objectUrl });
      }
    }

    void preparePreview();
    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [url]);

  const previewUrl = generatedPreview?.source === url ? generatedPreview.url : url;
  return <iframe className={className} src={previewUrl} title={title} />;
}
