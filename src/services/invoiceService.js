import PDFDocument from 'pdfkit';

// Generate an invoice PDF as a Buffer
export const generateInvoicePDF = async (order) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      // Header
      doc
        .fontSize(22)
        .text('Invoice', { align: 'right' })
        .moveDown();

      // Seller details (customize)
      doc
        .fontSize(12)
        .text('E-commerce', { align: 'left' })
        .text('support@commerce.example')
        .text('https://commerce.example')
        .moveDown();

      // Invoice meta
      doc
        .fontSize(12)
        .text(`Invoice No: ${order._id}`)
        .text(`Date: ${new Date(order.paidAt || order.createdAt).toLocaleString()}`)
        .text(`Payment Method: ${order.paymentMethod}`)
        .moveDown();

      // Bill to
      doc
        .fontSize(14)
        .text('Bill To')
        .fontSize(12)
        .text(`${order.user?.fullName || order.user?.email || 'Customer'}`)
        .text(`${order.user?.email}`)
        .text(`${order.user?.phoneNumber}`)
        .text(order.shippingAddress?.address)
        .text(`${order.shippingAddress?.city}, ${order.shippingAddress?.postalCode}`)
        .text(order.shippingAddress?.country)
        .moveDown();

      // Items table header
      doc
        .fontSize(12)
        .text('Item', 50, doc.y, { continued: true })
        .text('Qty', 300, doc.y, { width: 50, align: 'right', continued: true })
        .text('Price', 370, doc.y, { width: 80, align: 'right', continued: true })
        .text('Total', 460, doc.y, { width: 100, align: 'right' });

      doc.moveTo(50, doc.y + 5).lineTo(560, doc.y + 5).stroke();

      // Items
      order.items.forEach((item) => {
        const name = item.product?.name || item.product?.toString() || 'Product';
        const qty = item.quantity;
        const price = item.price;
        const total = qty * price;
        doc
          .fontSize(12)
          .text(name, 50, doc.y + 10, { continued: true })
          .text(String(qty), 300, doc.y, { width: 50, align: 'right', continued: true })
          .text(price.toFixed(2), 370, doc.y, { width: 80, align: 'right', continued: true })
          .text(total.toFixed(2), 460, doc.y, { width: 100, align: 'right' });
      });

      doc.moveDown();

      // Summary
      const yStart = doc.y + 10;
      doc
        .fontSize(12)
        .text('Items Subtotal:', 370, yStart, { width: 150, align: 'right', continued: true })
        .text(order.itemsPrice.toFixed(2), 520, yStart, { width: 80, align: 'right' });

      doc
        .text('Tax:', 370, doc.y + 5, { width: 150, align: 'right', continued: true })
        .text(order.taxPrice.toFixed(2), 520, doc.y, { width: 80, align: 'right' });

      doc
        .text('Shipping:', 370, doc.y + 5, { width: 150, align: 'right', continued: true })
        .text(order.shippingPrice.toFixed(2), 520, doc.y, { width: 80, align: 'right' });

      doc
        .font('Helvetica-Bold')
        .text('Total:', 370, doc.y + 8, { width: 150, align: 'right', continued: true })
        .text(order.totalPrice.toFixed(2), 520, doc.y, { width: 80, align: 'right' })
        .font('Helvetica');

      // Footer
      doc.moveDown(2);
      doc
        .fontSize(10)
        .text('Thank you for your purchase!', { align: 'center' })
        .text('This is a system generated invoice.', { align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};
