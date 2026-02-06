import { XMLParser } from 'fast-xml-parser';
import { InvoiceData, InvoiceLineItem, InvoiceTaxBreakdown } from './invoiceTemplate';

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    isArray: (name) => {
        // These elements can appear multiple times
        return [
            'IncludedSupplyChainTradeLineItem',
            'ApplicableTradeTax',
            'SpecifiedTaxRegistration',
            'IncludedNote',
        ].includes(name);
    },
});

// Safe accessor: drills into a parsed XML object using dot-separated keys.
// Returns undefined when any segment is missing.
function dig(obj: unknown, path: string): unknown {
    let current: unknown = obj;
    for (const key of path.split('.')) {
        if (current === null || current === undefined || typeof current !== 'object') {
            return undefined;
        }
        current = (current as Record<string, unknown>)[key];
    }
    return current;
}

function text(obj: unknown, path: string): string {
    const val = dig(obj, path);
    if (val === null || val === undefined) { return ''; }
    if (typeof val === 'object') {
        // Handle elements like <udt:DateTimeString format="102">20240115</udt:DateTimeString>
        // which parse to { '#text': '20240115', '@_format': '102' }
        const inner = (val as Record<string, unknown>)['#text'];
        return inner !== undefined && inner !== null ? String(inner) : '';
    }
    return String(val);
}

function formatDate(raw: string): string {
    // ZUGFeRD dates use format "102" → YYYYMMDD
    if (/^\d{8}$/.test(raw)) {
        return `${raw.slice(6, 8)}.${raw.slice(4, 6)}.${raw.slice(0, 4)}`;
    }
    return raw;
}

function parseAddress(party: unknown): { name: string; street: string; postalCode: string; city: string; country: string } {
    return {
        name: text(party, 'Name'),
        street: text(party, 'PostalTradeAddress.LineOne'),
        postalCode: text(party, 'PostalTradeAddress.PostcodeCode'),
        city: text(party, 'PostalTradeAddress.CityName'),
        country: text(party, 'PostalTradeAddress.CountryID'),
    };
}

function asArray<T>(val: T | T[] | undefined | null): T[] {
    if (val === undefined || val === null) { return []; }
    return Array.isArray(val) ? val : [val];
}

const paymentMeansNames: Record<string, string> = {
    '10': 'Cash',
    '20': 'Cheque',
    '30': 'Credit transfer',
    '42': 'Payment to bank account',
    '48': 'Card payment',
    '49': 'Direct debit',
    '57': 'Standing agreement',
    '58': 'SEPA credit transfer',
    '59': 'SEPA direct debit',
};

/**
 * Checks whether the given XML string is a valid ZUGFeRD / Factur-X / CII document.
 * Returns true when the root element is `CrossIndustryInvoice` (namespace prefix stripped).
 */
export function isZugferdXml(xml: string): boolean {
    try {
        const parsed = parser.parse(xml);
        return parsed.CrossIndustryInvoice !== undefined;
    } catch {
        return false;
    }
}

export function parseZugferdXml(xml: string): InvoiceData {
    const parsed = parser.parse(xml);

    // The root element is CrossIndustryInvoice (namespace prefix stripped)
    const root = parsed.CrossIndustryInvoice;
    if (!root) {
        throw new Error('Not a valid ZUGFeRD/CII XML document');
    }

    const doc = root.ExchangedDocument;
    const context = root.ExchangedDocumentContext;
    const transaction = root.SupplyChainTradeTransaction;
    const agreement = dig(transaction, 'ApplicableHeaderTradeAgreement');
    const delivery = dig(transaction, 'ApplicableHeaderTradeDelivery');
    const settlement = dig(transaction, 'ApplicableHeaderTradeSettlement');
    const totals = dig(settlement, 'SpecifiedTradeSettlementHeaderMonetarySummation');

    // Extract ZUGFeRD metadata
    const guidelineParam = dig(context, 'GuidelineSpecifiedDocumentContextParameter');
    const zugferdVersion = text(guidelineParam, 'ID');

    // Profile is found in BusinessProcessSpecifiedDocumentContextParameter or derived from version
    const businessProcess = dig(context, 'BusinessProcessSpecifiedDocumentContextParameter');
    let zugferdProfile = text(businessProcess, 'ID');

    // Map common profile codes to readable names
    const profileNames: Record<string, string> = {
        'A1': 'MINIMUM',
        'A2': 'BASIC WL',
        'A3': 'BASIC',
        'A4': 'EN 16931',
        'A5': 'EXTENDED',
        'urn:factur-x.eu:1p0:minimum': 'MINIMUM',
        'urn:factur-x.eu:1p0:basicwl': 'BASIC WL',
        'urn:factur-x.eu:1p0:basic': 'BASIC',
        'urn:cen.eu:en16931:2017': 'EN 16931',
        'urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:extended': 'EXTENDED',
    };

    if (profileNames[zugferdProfile]) {
        zugferdProfile = profileNames[zugferdProfile];
    }

    const seller = dig(agreement, 'SellerTradeParty');
    const buyer = dig(agreement, 'BuyerTradeParty');

    // Seller tax registrations
    const taxRegs = asArray(dig(seller, 'SpecifiedTaxRegistration') as Record<string, unknown>[] | Record<string, unknown>);
    let sellerTaxId = '';
    let sellerVatId = '';
    for (const reg of taxRegs) {
        const id = reg.ID;
        const scheme = typeof id === 'object' && id !== null ? (id as Record<string, unknown>)['@_schemeID'] : undefined;
        const value = text(reg, 'ID');
        if (scheme === 'VA') { sellerVatId = value; }
        else if (scheme === 'FC') { sellerTaxId = value; }
    }

    // Buyer tax registrations
    const buyerTaxRegs = asArray(dig(buyer, 'SpecifiedTaxRegistration') as Record<string, unknown>[] | Record<string, unknown>);
    let buyerVatId = '';
    for (const reg of buyerTaxRegs) {
        const id = reg.ID;
        const scheme = typeof id === 'object' && id !== null ? (id as Record<string, unknown>)['@_schemeID'] : undefined;
        if (scheme === 'VA') { buyerVatId = text(reg, 'ID'); break; }
    }

    // Seller contact
    const sellerContact = dig(seller, 'DefinedTradeContact');
    const sellerContactName = text(sellerContact, 'PersonName');
    const sellerEmail = text(sellerContact, 'EmailURIUniversalCommunication.URIID');
    const sellerPhone = text(sellerContact, 'TelephoneUniversalCommunication.CompleteNumber');

    // Currency
    const currency = text(settlement, 'InvoiceCurrencyCode');

    // Line items
    const rawItems = asArray(dig(transaction, 'IncludedSupplyChainTradeLineItem') as unknown[]);
    const lineItems: InvoiceLineItem[] = rawItems.map(item => {
        const qty = text(item, 'SpecifiedLineTradeDelivery.BilledQuantity');
        const unit = (() => {
            const bq = dig(item, 'SpecifiedLineTradeDelivery.BilledQuantity');
            if (typeof bq === 'object' && bq !== null) {
                return String((bq as Record<string, unknown>)['@_unitCode'] ?? '');
            }
            return '';
        })();
        const taxPercent = text(item, 'SpecifiedLineTradeSettlement.ApplicableTradeTax.0.RateApplicablePercent')
            || text(item, 'SpecifiedLineTradeSettlement.ApplicableTradeTax.RateApplicablePercent');

        return {
            position: text(item, 'AssociatedDocumentLineDocument.LineID'),
            description: text(item, 'SpecifiedTradeProduct.Name'),
            quantity: qty,
            unit,
            unitPrice: text(item, 'SpecifiedLineTradeAgreement.NetPriceProductTradePrice.ChargeAmount'),
            taxRate: taxPercent ? `${taxPercent}%` : '',
            total: text(item, 'SpecifiedLineTradeSettlement.SpecifiedTradeSettlementLineMonetarySummation.LineTotalAmount'),
        };
    });

    // Tax breakdown
    const rawTaxes = asArray(dig(settlement, 'ApplicableTradeTax') as unknown[]);
    const taxBreakdown: InvoiceTaxBreakdown[] = rawTaxes.map(t => ({
        rate: `${text(t, 'RateApplicablePercent')}%`,
        basis: text(t, 'BasisAmount'),
        amount: text(t, 'CalculatedAmount'),
    }));

    // Payment means
    const paymentMeans = dig(settlement, 'SpecifiedTradeSettlementPaymentMeans');
    const paymentTypeCode = text(paymentMeans, 'TypeCode');

    // Payment terms
    const terms = dig(settlement, 'SpecifiedTradePaymentTerms');
    const dueDate = text(terms, 'DueDateDateTime.DateTimeString');

    // Notes
    const notes = asArray(dig(doc, 'IncludedNote') as unknown[]);
    const noteTexts = notes.map(n => text(n, 'Content')).filter(Boolean);

    return {
        zugferdVersion: zugferdVersion || undefined,
        zugferdProfile: zugferdProfile || undefined,

        seller: parseAddress(seller),
        sellerTaxId: sellerTaxId || undefined,
        sellerVatId: sellerVatId || undefined,
        sellerContact: sellerContactName || undefined,
        sellerEmail: sellerEmail || undefined,
        sellerPhone: sellerPhone || undefined,

        buyer: parseAddress(buyer),
        buyerVatId: buyerVatId || undefined,
        buyerReference: text(agreement, 'BuyerReference') || undefined,

        invoiceNumber: text(doc, 'ID'),
        invoiceDate: formatDate(text(doc, 'IssueDateTime.DateTimeString')),
        dueDate: dueDate ? formatDate(dueDate) : undefined,
        deliveryDate: formatDate(text(delivery, 'ActualDeliverySupplyChainEvent.OccurrenceDateTime.DateTimeString')) || undefined,
        orderReference: text(agreement, 'BuyerOrderReferencedDocument.IssuerAssignedID') || undefined,
        currency,

        lineItems,

        totalNet: text(totals, 'TaxBasisTotalAmount'),
        totalTax: text(totals, 'TaxTotalAmount'),
        totalGross: text(totals, 'GrandTotalAmount'),
        taxBreakdown: taxBreakdown.length > 0 ? taxBreakdown : undefined,

        paymentTerms: text(terms, 'Description') || undefined,
        paymentMeansType: paymentMeansNames[paymentTypeCode] ?? (paymentTypeCode || undefined),
        bankName: text(paymentMeans, 'PayeeSpecifiedCreditorFinancialInstitution.Name') || undefined,
        iban: text(paymentMeans, 'PayeePartyCreditorFinancialAccount.IBANID') || undefined,
        bic: text(paymentMeans, 'PayeeSpecifiedCreditorFinancialInstitution.BICID') || undefined,
        paymentReference: text(settlement, 'PaymentReference') || undefined,
        notes: noteTexts.join('\n') || undefined,
    };
}
