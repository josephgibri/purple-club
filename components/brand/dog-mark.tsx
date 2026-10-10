import { publicAsset } from "@/lib/public-asset";

type DogMarkProps = {
  /** CSS pixel size of the square mark. */
  size?: number;
  className?: string;
};

/**
 * Locked brand mark. The file is the asset — do not redraw the dog.
 * The eye is the only looping motion in the shell.
 */
export function DogMark({ size = 28, className = "" }: DogMarkProps) {
  return (
    <span
      className={`relative inline-block shrink-0 overflow-hidden ${className}`}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={publicAsset("/brand/dog.png")}
        alt=""
        width={size}
        height={size}
        className="h-full w-full object-cover object-[center_28%]"
      />
      <span className="dog-eye" aria-hidden />
    </span>
  );
}
