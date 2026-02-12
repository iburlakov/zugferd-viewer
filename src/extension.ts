import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PDFDocument } from 'pdf-lib';
import { extractXmlAttachment } from './pdfReader';
import { isZugferdXml, parseZugferdXml } from './zugferdParser';
import { renderInvoiceHtml } from './invoiceTemplate';


export function activate(context: vscode.ExtensionContext) {
    console.log('Zugferd Viewer extension is now active');

    const disposable = vscode.commands.registerCommand(
        'zugferd-viewer.previewZugferdXml',
        async () => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('No workspace folder is open');
                return;
            }

            const pdfFiles = await vscode.workspace.findFiles('**/*.pdf');
            if (pdfFiles.length === 0) {
                vscode.window.showInformationMessage('No PDF files found in the workspace');
                return;
            }

            const quickPickItems = pdfFiles.map(uri => ({
                label: path.basename(uri.fsPath),
                description: vscode.workspace.asRelativePath(uri.fsPath),
                uri: uri
            }));

            const selected = await vscode.window.showQuickPick(quickPickItems, {
                placeHolder: 'Select a PDF file to preview ZUGFeRD invoice'
            });

            if (!selected) {
                return;
            }

            await openZugferdPreview(selected.uri, context.extensionUri);
        }
    );

    const openXmlDisposable = vscode.commands.registerCommand(
        'zugferd-viewer.openZugferdXmlFile',
        async () => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('No workspace folder is open');
                return;
            }

            const xmlFiles = await vscode.workspace.findFiles('**/*.xml');
            if (xmlFiles.length === 0) {
                vscode.window.showInformationMessage('No XML files found in the workspace');
                return;
            }

            const quickPickItems = xmlFiles.map(uri => ({
                label: path.basename(uri.fsPath),
                description: vscode.workspace.asRelativePath(uri.fsPath),
                uri: uri
            }));

            const selected = await vscode.window.showQuickPick(quickPickItems, {
                placeHolder: 'Select an XML file to preview ZUGFeRD invoice'
            });

            if (!selected) {
                return;
            }

            await openZugferdXmlFile(selected.uri, context.extensionUri);
        }
    );

    context.subscriptions.push(disposable, openXmlDisposable);
}

async function openZugferdPreview(pdfUri: vscode.Uri, extensionUri: vscode.Uri) {
    try {
        const pdfData = fs.readFileSync(pdfUri.fsPath);
        const pdfDoc = await PDFDocument.load(pdfData);

        const xmlContent = extractXmlAttachment(pdfDoc);

        if (!xmlContent) {
            vscode.window.showInformationMessage(
                `No ZUGFeRD XML found in "${path.basename(pdfUri.fsPath)}"`
            );
            return;
        }

        if (!isZugferdXml(xmlContent)) {
            vscode.window.showWarningMessage(
                `The XML embedded in "${path.basename(pdfUri.fsPath)}" is not a valid ZUGFeRD/Factur-X document.`
            );
            return;
        }

        const invoiceData = parseZugferdXml(xmlContent);

        const panel = vscode.window.createWebviewPanel(
            'zugferdPreview',
            `Invoice ${invoiceData.invoiceNumber}`,
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        const cssUri = panel.webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, 'media', 'invoice.css')
        );

        panel.webview.html = renderInvoiceHtml(invoiceData, cssUri.toString());
    } catch (error) {
        vscode.window.showErrorMessage(
            `Error reading PDF: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
    }
}

async function openZugferdXmlFile(xmlUri: vscode.Uri, extensionUri: vscode.Uri) {
    try {
        const xmlContent = fs.readFileSync(xmlUri.fsPath, 'utf-8');

        if (!isZugferdXml(xmlContent)) {
            vscode.window.showWarningMessage(
                `"${path.basename(xmlUri.fsPath)}" is not a valid ZUGFeRD/Factur-X document.`
            );
            return;
        }

        const invoiceData = parseZugferdXml(xmlContent);

        const panel = vscode.window.createWebviewPanel(
            'zugferdPreview',
            `Invoice ${invoiceData.invoiceNumber}`,
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        const cssUri = panel.webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, 'media', 'invoice.css')
        );

        panel.webview.html = renderInvoiceHtml(invoiceData, cssUri.toString());
    } catch (error) {
        vscode.window.showErrorMessage(
            `Error reading XML: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
    }
}

export function deactivate() {}
