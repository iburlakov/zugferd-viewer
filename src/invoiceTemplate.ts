export interface InvoiceAddress {
    name: string;
    street: string;
    postalCode: string;
    city: string;
    country: string;
}

export interface InvoiceLineItem {
    position: string;
    description: string;
    quantity: string;
    unit: string;
    unitPrice: string;
    taxRate: string;
    total: string;
}

export interface InvoiceTaxBreakdown {
    rate: string;
    basis: string;
    amount: string;
}

export interface InvoiceData {
    // ZUGFeRD metadata
    zugferdVersion?: string;
    zugferdProfile?: string;

    seller: InvoiceAddress;
    sellerTaxId?: string;
    sellerVatId?: string;
    sellerContact?: string;
    sellerEmail?: string;
    sellerPhone?: string;

    buyer: InvoiceAddress;
    buyerVatId?: string;
    buyerReference?: string;

    invoiceNumber: string;
    invoiceDate: string;
    dueDate?: string;
    deliveryDate?: string;
    orderReference?: string;
    currency: string;

    lineItems: InvoiceLineItem[];

    totalNet: string;
    totalTax: string;
    totalGross: string;
    taxBreakdown?: InvoiceTaxBreakdown[];

    paymentTerms?: string;
    paymentMeansType?: string;
    bankName?: string;
    iban?: string;
    bic?: string;
    paymentReference?: string;
    notes?: string;
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatAddressLines(addr: InvoiceAddress): string {
    return [addr.street, `${addr.postalCode} ${addr.city}`, addr.country]
        .filter(Boolean)
        .map(l => escapeHtml(l))
        .join('<br>');
}

function metaRow(label: string, value: string | undefined): string {
    if (!value) { return ''; }
    return `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`;
}

export function renderInvoiceHtml(data: InvoiceData, cssUri: string): string {
    // --- Line item rows ---
    const lineItemRows = data.lineItems
        .map(item => `
                <tr>
                    <td class="right">${escapeHtml(item.position)}</td>
                    <td>${escapeHtml(item.description)}</td>
                    <td class="right">${escapeHtml(item.quantity)}</td>
                    <td>${escapeHtml(item.unit)}</td>
                    <td class="right">${escapeHtml(item.unitPrice)}</td>
                    <td class="right">${escapeHtml(item.taxRate)}</td>
                    <td class="right">${escapeHtml(item.total)}</td>
                </tr>`)
        .join('');

    // --- Tax breakdown rows ---
    const taxBreakdownRows = (data.taxBreakdown ?? [])
        .map(t => `
                <tr>
                    <td>${escapeHtml(t.rate)}</td>
                    <td class="right">${escapeHtml(t.basis)} ${escapeHtml(data.currency)}</td>
                    <td class="right">${escapeHtml(t.amount)} ${escapeHtml(data.currency)}</td>
                </tr>`)
        .join('');

    // --- Seller return line (compact one-liner for DIN 5008 window) ---
    const sellerReturnParts = [
        data.seller.name,
        data.seller.street,
        `${data.seller.postalCode} ${data.seller.city}`,
        data.seller.country,
    ].filter(Boolean).map(s => escapeHtml(s));
    const sellerReturnLine = sellerReturnParts.join(' &middot; ');

    // --- Seller IDs for page footer ---
    const sellerIdParts: string[] = [];
    if (data.sellerVatId) { sellerIdParts.push(`VAT ID: ${escapeHtml(data.sellerVatId)}`); }
    if (data.sellerTaxId) { sellerIdParts.push(`Fiscal code: ${escapeHtml(data.sellerTaxId)}`); }

    // --- Footer blocks ---
    const paymentLines: string[] = [];
    if (data.iban) { paymentLines.push(`IBAN: ${escapeHtml(data.iban)}`); }
    if (data.bic) { paymentLines.push(`BIC: ${escapeHtml(data.bic)}`); }
    if (data.bankName) { paymentLines.push(escapeHtml(data.bankName)); }
    if (data.paymentMeansType) { paymentLines.push(escapeHtml(data.paymentMeansType)); }
    if (data.paymentReference) { paymentLines.push(`Ref: ${escapeHtml(data.paymentReference)}`); }

    const contactLines: string[] = [];
    if (data.sellerContact) { contactLines.push(escapeHtml(data.sellerContact)); }
    if (data.sellerEmail) { contactLines.push(escapeHtml(data.sellerEmail)); }
    if (data.sellerPhone) { contactLines.push(escapeHtml(data.sellerPhone)); }

    const hasFooter = paymentLines.length > 0 || data.paymentTerms || contactLines.length > 0;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Invoice ${escapeHtml(data.invoiceNumber)}</title>
    <link rel="stylesheet" href="${cssUri}">
</head>
<body>
<div class="page">
    <!-- Header -->
    <div class="header">
        <div>
            <div class="company-name">${escapeHtml(data.seller.name)}</div>
        </div>
        ${data.zugferdVersion || data.zugferdProfile ? `
        <div class="zugferd-badge">
            ${data.zugferdVersion ? `<span>ZUGFeRD ${escapeHtml(data.zugferdVersion)}</span>` : ''}
            ${data.zugferdProfile ? `<span>${escapeHtml(data.zugferdProfile)}</span>` : ''}
        </div>
        ` : ''}
    </div>

    <!-- DIN 5008 address zone -->
    <div class="address-zone">
        <div class="sender-return-line">${sellerReturnLine}</div>
        <div class="recipient-address">
            <div class="recipient-name">${escapeHtml(data.buyer.name)}</div>
            ${formatAddressLines(data.buyer)}
        </div>
    </div>

    <!-- Invoice title + meta -->
    <div class="title-meta-row">
        <div class="invoice-title">Invoice</div>
        <div class="invoice-meta">
            <table>
                <tr><td>Invoice no.</td><td>${escapeHtml(data.invoiceNumber)}</td></tr>
                <tr><td>Date</td><td>${escapeHtml(data.invoiceDate)}</td></tr>
                ${metaRow('Due date', data.dueDate)}
                ${metaRow('Delivery date', data.deliveryDate)}
                ${metaRow('Order ref.', data.orderReference)}
                ${metaRow('Buyer ref.', data.buyerReference)}
                <tr><td>Currency</td><td>${escapeHtml(data.currency)}</td></tr>
            </table>
        </div>
    </div>

    <!-- Line items -->
    <table class="line-items">
        <thead>
            <tr>
                <th class="right" style="width:40px">Pos.</th>
                <th>Description</th>
                <th class="right" style="width:60px">Qty</th>
                <th style="width:40px">Unit</th>
                <th class="right" style="width:80px">Unit price</th>
                <th class="right" style="width:55px">Tax</th>
                <th class="right" style="width:90px">Total</th>
            </tr>
        </thead>
        <tbody>
            ${lineItemRows}
        </tbody>
    </table>

    <!-- Totals -->
    <div class="totals-section">
        <table class="totals-table">
            <tr><td>Net total</td><td>${escapeHtml(data.totalNet)} ${escapeHtml(data.currency)}</td></tr>
            <tr><td>Tax</td><td>${escapeHtml(data.totalTax)} ${escapeHtml(data.currency)}</td></tr>
            <tr class="gross-row"><td>Total</td><td>${escapeHtml(data.totalGross)} ${escapeHtml(data.currency)}</td></tr>
        </table>
    </div>

    ${taxBreakdownRows ? `
    <!-- Tax breakdown -->
    <div class="section">
        <div class="section-title">Tax breakdown</div>
        <table class="tax-breakdown">
            <thead>
                <tr>
                    <th>Tax rate</th>
                    <th class="right">Taxable amount</th>
                    <th class="right">Tax amount</th>
                </tr>
            </thead>
            <tbody>
                ${taxBreakdownRows}
            </tbody>
        </table>
    </div>
    ` : ''}

    ${hasFooter ? `
    <!-- Footer sections -->
    <div class="footer-sections">
        ${paymentLines.length > 0 ? `
        <div class="footer-block">
            <div class="footer-block-title">Payment details</div>
            <p>${paymentLines.join('<br>')}</p>
        </div>
        ` : ''}

        ${data.paymentTerms ? `
        <div class="footer-block">
            <div class="footer-block-title">Payment terms</div>
            <p>${escapeHtml(data.paymentTerms)}</p>
        </div>
        ` : ''}

        ${contactLines.length > 0 ? `
        <div class="footer-block">
            <div class="footer-block-title">Contact</div>
            <p>${contactLines.join('<br>')}</p>
        </div>
        ` : ''}
    </div>
    ` : ''}

    ${data.notes ? `
    <div class="notes-section">
        <div class="section-title">Notes</div>
        <div class="notes">${escapeHtml(data.notes)}</div>
    </div>
    ` : ''}

    <!-- Page footer -->
    <div class="page-footer">
        <span>${escapeHtml(data.seller.name)}</span>
        ${sellerIdParts.length > 0 ? `<span>${sellerIdParts.join(' &middot; ')}</span>` : ''}
    </div>
</div>
</body>
</html>`;
}
