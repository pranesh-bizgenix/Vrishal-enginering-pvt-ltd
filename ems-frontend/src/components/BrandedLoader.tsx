import Image from 'next/image';

type BrandedLoaderProps = {
  message?: string;
  fullScreen?: boolean;
  overlay?: boolean;
};

export function BrandedLoader({
  message = 'Loading workspace...',
  fullScreen = true,
  overlay = false,
}: BrandedLoaderProps) {
  if (overlay) {
    return (
      <div className="branded-loader-overlay" aria-live="polite" role="status">
        <div className="branded-loader-backdrop" />
        <div className="branded-loader-card">
          <div className="branded-loader-orbit">
            <div className="branded-loader-ring" />
            <Image
              alt="SJ Sangath"
              className="branded-loader-logo"
              height={88}
              priority
              src="/sangath-ipl-loader.jpg"
              width={88}
            />
          </div>
          <p>{message}</p>
        </div>
      </div>
    );
  }

  return (
    <main className={fullScreen ? 'branded-loader-page' : 'branded-loader-inline'}>
      <div className="branded-loader-backdrop" />
      <div className="branded-loader-card" role="status" aria-live="polite">
        <div className="branded-loader-orbit">
          <div className="branded-loader-ring" />
          <Image
            alt="SJ Sangath"
            className="branded-loader-logo"
            height={88}
            priority
            src="/sangath-ipl-loader.jpg"
            width={88}
          />
        </div>
        <p>{message}</p>
      </div>
    </main>
  );
}
