// pdf-parse ships no types. We import the inner file because the package root runs a debug
// routine on load that looks for a test PDF.
declare module 'pdf-parse/lib/pdf-parse.js' {
  const pdfParse: (data: Buffer) => Promise<{ text: string; numpages: number }>;
  export default pdfParse;
}
