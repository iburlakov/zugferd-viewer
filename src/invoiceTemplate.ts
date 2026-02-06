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

function formatAddress(addr: InvoiceAddress): string {
    return [
        escapeHtml(addr.name),
        escapeHtml(addr.street),
        `${escapeHtml(addr.postalCode)} ${escapeHtml(addr.city)}`,
        escapeHtml(addr.country),
    ].join('<br>');
}

function optionalRow(label: string, value: string | undefined): string {
    if (!value) { return ''; }
    return `<tr><td class="label">${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`;
}

export function renderInvoiceHtml(data: InvoiceData, cssUri: string): string {
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

    const taxBreakdownRows = (data.taxBreakdown ?? [])
        .map(t => `
            <tr>
                <td>${escapeHtml(t.rate)}</td>
                <td class="right">${escapeHtml(t.basis)}</td>
                <td class="right">${escapeHtml(t.amount)}</td>
            </tr>`)
        .join('');

    const sellerIds: string[] = [];
    if (data.sellerTaxId) { sellerIds.push(`Fiscal code: ${escapeHtml(data.sellerTaxId)}`); }
    if (data.sellerVatId) { sellerIds.push(`VAT ID: ${escapeHtml(data.sellerVatId)}`); }

    const contactRows: string[] = [];
    if (data.sellerContact) { contactRows.push(optionalRow('Contact', data.sellerContact)); }
    if (data.sellerPhone) { contactRows.push(optionalRow('Phone', data.sellerPhone)); }
    if (data.sellerEmail) { contactRows.push(optionalRow('Email', data.sellerEmail)); }

    const paymentRows: string[] = [];
    if (data.paymentTerms) { paymentRows.push(optionalRow('Payment terms', data.paymentTerms)); }
    if (data.paymentMeansType) { paymentRows.push(optionalRow('Payment method', data.paymentMeansType)); }
    if (data.bankName) { paymentRows.push(optionalRow('Bank', data.bankName)); }
    if (data.iban) { paymentRows.push(optionalRow('IBAN', data.iban)); }
    if (data.bic) { paymentRows.push(optionalRow('BIC', data.bic)); }
    if (data.paymentReference) { paymentRows.push(optionalRow('Payment reference', data.paymentReference)); }

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Invoice ${escapeHtml(data.invoiceNumber)}</title>
    <link rel="stylesheet" href="${cssUri}">
</head>
<body>
    ${data.zugferdVersion || data.zugferdProfile ? `
    <!-- ZUGFeRD metadata -->
    <div class="zugferd-badge">
        ${data.zugferdVersion ? `<span>ZUGFeRD ${escapeHtml(data.zugferdVersion)}</span>` : ''}
        ${data.zugferdProfile ? `<span>${escapeHtml(data.zugferdProfile)}</span>` : ''}
    </div>
    ` : ''}

    <div class="invoice-title">Invoice</div>

    <!-- invoice meta -->
    <section class="section">
        <table class="meta-table">
            <tr><td class="label">Invoice no.</td><td>${escapeHtml(data.invoiceNumber)}</td></tr>
            <tr><td class="label">Date</td><td>${escapeHtml(data.invoiceDate)}</td></tr>
            ${optionalRow('Due date', data.dueDate)}
            ${optionalRow('Delivery date', data.deliveryDate)}
            ${optionalRow('Order ref.', data.orderReference)}
            ${optionalRow('Buyer ref.', data.buyerReference)}
            <tr><td class="label">Currency</td><td>${escapeHtml(data.currency)}</td></tr>
        </table>
    </section>

    <!-- seller / buyer -->
    <section class="section parties">
        <div class="party">
            <div class="party-heading">From</div>
            <div class="party-name">${escapeHtml(data.seller.name)}</div>
            <div class="party-address">${formatAddress(data.seller)}</div>
            ${sellerIds.length > 0 ? `<div class="party-ids">${sellerIds.join('<br>')}</div>` : ''}
        </div>

        <div class="party">
            <div class="party-heading">To</div>
            <div class="party-name">${escapeHtml(data.buyer.name)}</div>
            <div class="party-address">${formatAddress(data.buyer)}</div>
            ${data.buyerVatId ? `<div class="party-ids">VAT ID: ${escapeHtml(data.buyerVatId)}</div>` : ''}
        </div>
    </section>

    <!-- line items -->
    <section class="section">
        <div class="section-title">Line items</div>
        <table class="line-items">
            <thead>
                <tr>
                    <th class="right">Pos.</th>
                    <th>Description</th>
                    <th class="right">Qty</th>
                    <th>Unit</th>
                    <th class="right">Unit price</th>
                    <th class="right">Tax %</th>
                    <th class="right">Total</th>
                </tr>
            </thead>
            <tbody>
                ${lineItemRows}
            </tbody>
        </table>
    </section>

    <!-- totals -->
    <section class="section">
        <table class="totals-table">
            <tr><td>Net total</td><td>${escapeHtml(data.totalNet)} ${escapeHtml(data.currency)}</td></tr>
            <tr><td>Tax</td><td>${escapeHtml(data.totalTax)} ${escapeHtml(data.currency)}</td></tr>
            <tr class="gross"><td class="gross">Total</td><td class="gross">${escapeHtml(data.totalGross)} ${escapeHtml(data.currency)}</td></tr>
        </table>
    </section>

    ${taxBreakdownRows ? `
    <!-- tax breakdown -->
    <section class="section">
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
    </section>
    ` : ''}

    ${paymentRows.length > 0 ? `
    <!-- payment details -->
    <section class="section">
        <div class="section-title">Payment details</div>
        <table class="meta-table">
            ${paymentRows.join('')}
        </table>
    </section>
    ` : ''}

    ${contactRows.length > 0 ? `
    <!-- seller contact -->
    <section class="section">
        <div class="section-title">Contact</div>
        <table class="meta-table">
            ${contactRows.join('')}
        </table>
    </section>
    ` : ''}

    ${data.notes ? `
    <!-- notes -->
    <section class="section">
        <div class="section-title">Notes</div>
        <div class="notes">${escapeHtml(data.notes)}</div>
    </section>
    ` : ''}
</body>
</html>`;
}
