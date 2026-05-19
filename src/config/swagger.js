const swaggerSpec = {
  openapi: "3.0.3",
  info: {
    title: "E-commerce API",
    version: "1.0.0",
    description: "API documentation for the E-commerce backend.",
  },
  servers: [
    {
      url: "http://localhost:5000",
      description: "Local server",
    },
  ],
  tags: [
    { name: "Health" },
    { name: "Auth" },
    { name: "Products" },
    { name: "Orders" },
    { name: "Coupons" },
    { name: "Admin" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
  },
  paths: {
    "/api/health": {
      get: {
        tags: ["Health"],
        summary: "Health check",
        responses: {
          200: { description: "Server health response" },
        },
      },
    },
    "/api/auth/signup": {
      post: {
        tags: ["Auth"],
        summary: "Register user",
        requestBody: { required: true },
        responses: { 201: { description: "Created" } },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login user",
        requestBody: { required: true },
        responses: { 200: { description: "Success" } },
      },
    },
    "/api/products": {
      get: {
        tags: ["Products"],
        summary: "List products",
        responses: { 200: { description: "Success" } },
      },
      post: {
        tags: ["Products"],
        summary: "Create product",
        security: [{ bearerAuth: [] }],
        requestBody: { required: true },
        responses: { 201: { description: "Created" } },
      },
    },
    "/api/orders": {
      get: {
        tags: ["Orders"],
        summary: "Get my orders",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Success" } },
      },
      post: {
        tags: ["Orders"],
        summary: "Create order",
        security: [{ bearerAuth: [] }],
        requestBody: { required: true },
        responses: { 201: { description: "Created" } },
      },
    },
    "/api/orders/{orderId}/shipment": {
      put: {
        tags: ["Orders"],
        summary: "Update shipment details (admin)",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "orderId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: { required: true },
        responses: { 200: { description: "Updated" } },
      },
    },
    "/api/orders/webhooks/shipment": {
      post: {
        tags: ["Orders"],
        summary: "Courier webhook shipment status sync",
        requestBody: { required: true },
        responses: { 200: { description: "Synced" } },
      },
    },
    "/api/coupons/validate": {
      post: {
        tags: ["Coupons"],
        summary: "Validate coupon",
        security: [{ bearerAuth: [] }],
        requestBody: { required: true },
        responses: { 200: { description: "Success" } },
      },
    },
    "/api/coupons": {
      post: {
        tags: ["Coupons"],
        summary: "Create coupon (admin)",
        security: [{ bearerAuth: [] }],
        requestBody: { required: true },
        responses: { 201: { description: "Created" } },
      },
    },
    "/api/admin/orders": {
      get: {
        tags: ["Admin"],
        summary: "Get all orders (admin)",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Success" } },
      },
    },
    "/api/admin/orders/{orderId}/status": {
      put: {
        tags: ["Admin"],
        summary: "Update order status (admin)",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "orderId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: { required: true },
        responses: { 200: { description: "Updated" } },
      },
    },
  },
};

export default swaggerSpec;
