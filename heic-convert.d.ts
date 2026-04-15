declare module "heic-convert" {
  type HeicConvertArgs = {
    buffer: Uint8Array;
    format: "JPEG" | "PNG";
    quality?: number;
  };
  const heicConvert: (args: HeicConvertArgs) => Promise<ArrayBuffer | Uint8Array>;
  export default heicConvert;
}
