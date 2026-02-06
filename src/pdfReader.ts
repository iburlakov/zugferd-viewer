import { PDFDocument, PDFDict, PDFName, PDFArray, PDFString, PDFHexString, PDFRawStream, PDFStream } from 'pdf-lib';

export function extractXmlAttachment(pdfDoc: PDFDocument): string | undefined {
    const catalog = pdfDoc.catalog;
    const namesDict = catalog.lookup(PDFName.of('Names'), PDFDict);

    if (!namesDict) { return undefined; }

    const embeddedFilesDict = namesDict.lookup(PDFName.of('EmbeddedFiles'), PDFDict);
    if (!embeddedFilesDict) { return undefined; }

    const namesArray = embeddedFilesDict.lookup(PDFName.of('Names'), PDFArray);
    if (!namesArray) { return undefined; }

    // Names array alternates: [name, filespec, name, filespec, ...]
    for (let i = 0; i < namesArray.size(); i += 2) {
        const nameObj = namesArray.lookup(i);
        let fileName = '';
        if (nameObj instanceof PDFString || nameObj instanceof PDFHexString) {
            fileName = nameObj.decodeText();
        }

        // ZUGFeRD XML attachments are typically named factur-x.xml, ZUGFeRD-invoice.xml, or xrechnung.xml
        if (!fileName.toLowerCase().endsWith('.xml')) {
            continue;
        }

        const fileSpec = namesArray.lookup(i + 1, PDFDict);
        if (!fileSpec) { continue; }

        const efDict = fileSpec.lookup(PDFName.of('EF'), PDFDict);
        if (!efDict) { continue; }

        const stream = efDict.lookup(PDFName.of('F'));
        if (!stream) { continue; }

        let bytes: Uint8Array | undefined;

        if (stream instanceof PDFRawStream) {
            bytes = stream.getContents();
        } else if (stream instanceof PDFStream) {
            bytes = stream.getContents();
        }

        if (bytes) {
            return new TextDecoder('utf-8').decode(bytes);
        }
    }

    return undefined;
}
