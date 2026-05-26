import PDFDocument from 'pdfkit';

// ── Formatting helpers ────────────────────────────────────────────────────────
const formatAmount = (value) =>
  `Rs. ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CGST_RATE = 0.18;
const SGST_RATE = 0.18;

// ── Brand colours ─────────────────────────────────────────────────────────────
const C = {
  dark:       '#1A1208',
  darkMid:    '#2D1F0A',
  mid:        '#3D2D0E',
  gold:       '#D4A73C',
  goldLight:  '#F5E6B8',
  goldPale:   '#FDF8EE',
  line:       '#E8D9A8',
  muted:      '#9E8E72',
  white:      '#FFFFFF',
  cream:      '#FAF8F4',
  green:      '#16A34A',
  red:        '#DC2626',
};

// ── Canvas helpers ────────────────────────────────────────────────────────────
const W = 595.28;   // A4 width in pt
const H = 841.89;   // A4 height in pt
const ML = 40;      // margin left
const MR = W - 40;  // margin right

/**
 * Generate an invoice PDF as a Buffer.
 * @param {object} order  - Mongoose order document (plain object or populated)
 */
export const generateInvoicePDF = async (order) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });
      const chunks = [];
      doc.on('data',  (c) => chunks.push(c));
      doc.on('end',   ()  => resolve(Buffer.concat(chunks)));
      doc.on('error', (e) => reject(e));

      // ── Derived values ──────────────────────────────────────────────────────
      const invoiceNumber = order._id
        ? order._id.toString().substring(0, 8).toUpperCase()
        : 'N/A';
      const invoiceDate = new Date(order.paidAt || order.createdAt)
        .toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
      const isPaid = !!order.isPaid || String(order.status).toLowerCase() === 'paid';
      const cgst   = Number(order.cgstPrice     ?? (Number(order.itemsPrice || 0) * CGST_RATE));
      const sgst   = Number(order.sgstPrice     ?? (Number(order.itemsPrice || 0) * SGST_RATE));

      // ── 1. Dark header band ─────────────────────────────────────────────────
      doc.rect(0, 0, W, 240).fill(C.dark);

      // Decorative circles top-right
      doc.circle(W + 10, -10, 150).fill(C.darkMid);
      doc.circle(W + 30,  20, 100).fill('#3D2D0E');

      // Gold bottom accent line
      doc.rect(0, 239, W, 2).fill(C.gold);

      // Brand name
      doc
        .font('Helvetica-Bold').fontSize(34).fillColor(C.gold)
        .text('Shoply', ML, 30);

      // Tagline
      doc
        .font('Helvetica-Oblique').fontSize(10).fillColor(C.muted)
        .text('Curated Collections · Premium Shopping', ML, 68);

      // INVOICE word
      doc
        .font('Helvetica-Bold').fontSize(46).fillColor(C.white)
        .text('INVOICE', ML, 100);

      // Right-side meta
      const metaX = 360;
      const drawMeta = (x, y, label, value, valueColor = C.white) => {
        doc.font('Helvetica').fontSize(8).fillColor(C.muted).text(label.toUpperCase(), x, y);
        doc.font('Helvetica-Bold').fontSize(12).fillColor(valueColor).text(value, x, y + 14);
      };
      drawMeta(metaX,       50, 'Invoice No.',  `#${invoiceNumber}`, C.gold);
      drawMeta(metaX,       90, 'Date',          invoiceDate);
      drawMeta(metaX + 120, 50, 'Payment',       order.paymentMethod || 'COD');
      drawMeta(metaX + 120, 90, 'Status',
        isPaid ? 'Paid' : 'Pending',
        isPaid ? C.green : C.red);

      // ── 2. From / Bill To ───────────────────────────────────────────────────
      let cy = 270;

      const drawSectionLabel = (x, y, label) => {
        doc.font('Helvetica-Bold').fontSize(11).fillColor(C.dark).text(label, x, y);
        doc.rect(x, y + 16, 60, 2).fill(C.gold);
      };

      // From
      drawSectionLabel(ML, cy);
      doc.font('Helvetica-Bold').fontSize(12).fillColor(C.dark)
        .text('Shoply E-Commerce Pvt. Ltd.', ML, cy + 22);
      doc.font('Helvetica').fontSize(10).fillColor(C.mid);
      ['support@shoply.com', 'https://shoply.com',
       'GSTIN: 22AAAAA0000A1Z5',
       '123 Commerce Street, Bengaluru',
       'Karnataka – 560001, India',
      ].forEach((line, i) => doc.text(line, ML, cy + 38 + i * 15));

      // Bill To
      const bx = 320;
      drawSectionLabel(bx, cy, 'Bill To');
      const u = order.user || {};
      doc.font('Helvetica-Bold').fontSize(12).fillColor(C.dark)
        .text(u.fullName || u.name || 'Customer', bx, cy + 22);
      doc.font('Helvetica').fontSize(10).fillColor(C.mid);
      const sa = order.shippingAddress || {};
      [
        u.email || 'N/A',
        u.phoneNumber || order.phoneNumber || 'N/A',
        sa.address || '',
        sa.city ? `${sa.city}, ${sa.postalCode || ''}` : '',
        sa.country || 'India',
      ].filter(Boolean).forEach((line, i) => doc.text(line, bx, cy + 38 + i * 15));

      // Divider
      const divY = cy + 135;
      doc.moveTo(ML, divY).lineTo(MR, divY).lineWidth(1).strokeColor(C.line).stroke();

      // ── 3. Items table ──────────────────────────────────────────────────────
      let ty = divY + 16;

      // Header row background
      doc.roundedRect(ML, ty, MR - ML, 24, 4).fill(C.dark);

      const cols = { name: ML + 6, brand: 310, qty: 390, unit: 450, total: MR - 4 };
      doc.font('Helvetica-Bold').fontSize(9).fillColor(C.gold);
      doc.text('Item Description', cols.name, ty + 7);
      doc.text('Brand',            cols.brand, ty + 7);
      doc.text('Qty',              cols.qty,   ty + 7, { width: 30, align: 'center', marginRight: 10 });
      doc.text('Unit Price',       cols.unit,  ty + 7, { width: 55, align: 'right', marginRight: 10 });
      doc.text('Total',            cols.total - 55, ty + 7, { width: 55, align: 'right', marginRight: 40 });

      ty += 30;
      (order.items || []).forEach((item, i) => {
        const rowH = 28;
        if (i % 2 === 0) {
          doc.roundedRect(ML, ty - 2, MR - ML, rowH, 2).fill(C.goldPale);
        }

        const name  = item.product?.name || item.name || item.productName || 'Product';
        const brand = item.product?.brand || item.brand || '—';
        const qty   = item.quantity || 1;
        const price = item.price || 0;
        const rowTotal = qty * price;

        doc.font('Helvetica-Bold').fontSize(10).fillColor(C.dark)
          .text(name.substring(0, 38), cols.name, ty + 6);
        doc.font('Helvetica').fontSize(9).fillColor(C.muted)
          .text(brand.substring(0, 20), cols.brand, ty + 8);
        doc.font('Helvetica').fontSize(10).fillColor(C.mid)
          .text(String(qty), cols.qty, ty + 6, { width: 30, align: 'center' });
        doc.font('Helvetica').fontSize(10).fillColor(C.mid)
          .text(formatAmount(price), cols.unit, ty + 6, { width: 55, align: 'right' });
        doc.font('Helvetica-Bold').fontSize(10).fillColor(C.dark)
          .text(formatAmount(rowTotal), cols.total - 55, ty + 6, { width: 55, align: 'right' });

        ty += rowH;
      });

      // Table bottom line
      doc.moveTo(ML, ty + 4).lineTo(MR, ty + 4).lineWidth(0.5).strokeColor(C.line).stroke();

      // ── 4. Summary box ──────────────────────────────────────────────────────
      const sbx  = MR - 180;
      let   sby  = ty + 16;
      const sbw  = 180;
      const rg   = 22;

      const summaryRows = [
        ['Subtotal',   order.itemsPrice   || 0],
        ['CGST (18%)', cgst],
        ['SGST (18%)', sgst],
        ['Shipping',   order.shippingPrice || 0],
      ];
      const boxH = summaryRows.length * rg + 44;

      doc.roundedRect(sbx - 8, sby - 6, sbw + 16, boxH, 6)
        .fillAndStroke(C.goldPale, C.line);

      summaryRows.forEach(([label, amount]) => {
        doc.font('Helvetica').fontSize(10).fillColor(C.mid)
          .text(label, sbx, sby);
        doc.font('Helvetica').fontSize(10).fillColor(C.mid)
          .text(formatAmount(amount), sbx, sby, { width: sbw, align: 'right' });
        sby += rg;
      });

      // Total row
      doc.roundedRect(sbx - 8, sby + 2, sbw + 16, 32, 6).fill(C.dark);
      doc.font('Helvetica-Bold').fontSize(13).fillColor(C.gold)
        .text('TOTAL', sbx + 4, sby + 10);
      doc.font('Helvetica-Bold').fontSize(13).fillColor(C.gold)
        .text(formatAmount(order.totalPrice), sbx, sby + 10, { width: sbw - 4, align: 'right' });

      // ── 5. Notes box ────────────────────────────────────────────────────────
      const nx  = ML;
      const ny  = ty + 20;
      const nw  = sbx - ML - 16;

      doc.roundedRect(nx, ny, nw, 80, 6).fillAndStroke(C.goldPale, C.line);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(C.mid)
        .text('Terms & Notes', nx + 10, ny + 10);
      doc.font('Helvetica').fontSize(9).fillColor(C.muted);
      [
        '• Payment is due upon receipt for COD orders.',
        '• Returns & refunds: contact support within 7 days.',
        '• This is a computer-generated invoice.',
        '• No signature required.',
      ].forEach((note, i) => doc.text(note, nx + 10, ny + 24 + i * 13));

      // ── 6. PAID watermark ───────────────────────────────────────────────────
      if (isPaid) {
        doc.save();
        doc.translate(W / 2, H / 2);
        doc.rotate(-35);
        doc.font('Helvetica-Bold').fontSize(110)
          .fillColor(C.gold).fillOpacity(0.05)
          .text('PAID', -120, -60);
        doc.fillOpacity(1);
        doc.restore();
      }

      // ── 7. Footer ───────────────────────────────────────────────────────────
      const fh = 80;
      doc.rect(0, H - fh, W, fh).fill(C.dark);
      doc.rect(0, H - fh, W, 1.5).fill(C.gold);

      doc.font('Helvetica-Bold').fontSize(12).fillColor(C.gold)
        .text('Thank you for shopping with Shoply!', 0, H - fh + 18, { align: 'center', width: W });
      doc.font('Helvetica').fontSize(9).fillColor(C.muted)
        .text(
          'support@shoply.com  ·  https://shoply.com  ·  GSTIN: 22AAAAA0000A1Z5',
          0, H - fh + 38, { align: 'center', width: W }
        );
      doc.font('Helvetica').fontSize(8).fillColor('#5C4A28')
        .text(
          'This is a computer-generated invoice and does not require a physical signature.',
          0, H - fh + 54, { align: 'center', width: W }
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};