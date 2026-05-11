import PDFDocument from 'pdfkit';

const formatAmount = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(Number(value || 0));

// Generate an invoice PDF as a Buffer
export const generateInvoicePDF = async (order) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      const left = 50;
      const right = 545;
      const tableTopPadding = 24;
      const col = {
        item: left,
        qty: 340,
        unitPrice: 395,
        total: 480
      };

      const invoiceNumber = order._id ? order._id.toString().substring(0, 8).toUpperCase() : 'N/A';
      const invoiceDate = order.paidAt
        ? new Date(order.paidAt).toLocaleDateString('en-IN')
        : new Date(order.createdAt).toLocaleDateString('en-IN');

      // Header
      doc.fontSize(28).fillColor('#6d28d9').text('INVOICE', left, 40, { width: right - left, align: 'center' });

      // Company block
      doc.fontSize(14).fillColor('#111827').text('Shoply E-Commerce', left, 120);
      doc.fontSize(11).fillColor('#111827')
        .text('support@shoply.com', left, 142)
        .text('https://shoply.com', left, 158)
        .text('GSTIN: 22AAAAA0000A1Z5', left, 174);

      // Meta block
      doc.fontSize(12).fillColor('#111827')
        .text(`Invoice No: ${invoiceNumber}`, left, 214)
        .text(`Payment Method: ${order.paymentMethod || 'N/A'}`, left, 250);

      doc.fontSize(12).fillColor('#111827')
        .text(`Date: ${invoiceDate}`, 330, 236)
        .text(`Order Status: ${order.isPaid ? 'Paid' : 'Pending'}`, 330, 272);

      // Bill to block
      let billY = 318;
      doc.fontSize(14).fillColor('#6d28d9').text('Bill To:', 330, billY, { underline: true });
      billY += 32;
      doc.fontSize(11).fillColor('#111827')
        .text(order.user?.fullName || order.user?.email || 'Customer', 330, billY)
        .text(order.user?.email || 'N/A', 330, billY + 18)
        .text(order.user?.phoneNumber || order.phoneNumber || 'N/A', 330, billY + 36);

      if (order.shippingAddress) {
        doc.text(order.shippingAddress.address || '', 330, billY + 54)
          .text(`${order.shippingAddress.city || ''}, ${order.shippingAddress.postalCode || ''}`, 330, billY + 72)
          .text(order.shippingAddress.country || 'India', 330, billY + 90);
      }

      // Table
      let yPosition = 500;
      doc.fontSize(11).fillColor('#6d28d9')
        .text('Item Description', col.item, yPosition)
        .text('Qty', col.qty, yPosition, { width: 40, align: 'center' })
        .text('Unit Price', col.unitPrice, yPosition, { width: 75, align: 'right' })
        .text('Total', col.total, yPosition, { width: 65, align: 'right' });

      yPosition += 16;
      doc.moveTo(left, yPosition).lineTo(right, yPosition).lineWidth(1).strokeColor('#1f2937').stroke();
      yPosition += tableTopPadding;

      (order.items || []).forEach((item) => {
        const name = item.product?.name || item.name || item.productName || 'Product';
        const qty = item.quantity || 1;
        const price = item.price || 0;
        const total = qty * price;

        if (yPosition > 700) {
          doc.addPage();
          yPosition = 70;
        }

        doc.fontSize(12).fillColor('#111827')
          .text(name, col.item, yPosition, { width: 270, align: 'left' })
          .text(String(qty), col.qty, yPosition, { width: 40, align: 'center' })
          .text(formatAmount(price), col.unitPrice, yPosition, { width: 75, align: 'right' })
          .text(formatAmount(total), col.total, yPosition, { width: 65, align: 'right' });

        yPosition += 28;
      });

      // Summary section
      let summaryY = Math.max(yPosition + 14, 620);
      if (summaryY > 700) {
        doc.addPage();
        summaryY = 80;
      }
      doc.rect(335, summaryY - 10, 210, 112).lineWidth(1).strokeColor('#111827').stroke();
      doc.fontSize(12).fillColor('#111827')
        .text('Subtotal:', 350, summaryY)
        .text(formatAmount(order.itemsPrice), 455, summaryY, { width: 80, align: 'right' })
        .text('Tax:', 350, summaryY + 24)
        .text(formatAmount(order.taxPrice), 455, summaryY + 24, { width: 80, align: 'right' })
        .text('Shipping:', 350, summaryY + 48)
        .text(formatAmount(order.shippingPrice), 455, summaryY + 48, { width: 80, align: 'right' });

      doc.rect(335, summaryY + 74, 210, 28).fill('#6d28d9');
      doc.fontSize(13).fillColor('#ffffff')
        .text('TOTAL:', 350, summaryY + 82)
        .text(formatAmount(order.totalPrice), 455, summaryY + 82, { width: 80, align: 'right' });

      // Footer
      const footerY = 760;
      doc.fontSize(10).fillColor('#6b7280')
        .text('Thank you for your business!', left, footerY, { width: right - left, align: 'center' })
        .text('This is a computer-generated invoice and does not require a signature.', left, footerY + 14, { width: right - left, align: 'center' })
        .text('For any queries, please contact support@shoply.com', left, footerY + 28, { width: right - left, align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};
