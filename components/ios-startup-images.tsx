import { IOS_SPLASH_SCREENS, splashHref } from "@/lib/ios-splash";

export function IosStartupImages() {
  return (
    <>
      {IOS_SPLASH_SCREENS.map((screen) => (
        <link
          key={`${screen.width}x${screen.height}`}
          rel="apple-touch-startup-image"
          href={splashHref(screen.width, screen.height)}
          media={screen.media}
        />
      ))}
    </>
  );
}
