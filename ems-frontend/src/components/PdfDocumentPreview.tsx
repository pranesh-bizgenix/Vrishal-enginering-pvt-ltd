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
  const [previewUrl, setPreviewUrl] = useState(url);

  useEffect(() => {
    if (!url.startsWith('data:application/pdf')) {
      setPreviewUrl(url);
      return;
    }

    const objectUrl = createPdfObjectUrl(url);
    setPreviewUrl(objectUrl || url);
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [url]);

  return <iframe className={className} src={previewUrl} title={title} />;
}
