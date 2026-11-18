
const express = require("express");
const crypto = require("crypto");

const app = express();

// PORT dan SERVER_NAME membedakan instance saat file ini dijalankan beberapa kali.
const PORT = Number(process.env.PORT) || 3001;
const SERVER_NAME = process.env.SERVER_NAME || "Food Server 1";

app.use(express.json());

// Data menu makanan
const menus = [
  { id: 1, name: "Nasi Goreng", price: 15000 },
  { id: 2, name: "Mie Ayam", price: 12000 },
  { id: 3, name: "Ayam Geprek", price: 18000 },
  { id: 4, name: "Bakso", price: 13000 }
];

// Endpoint halaman utama
app.get("/", (req, res) => {
  res.json({
    message: "Layanan pemesanan makanan aktif",
    server: SERVER_NAME,
    port: PORT
  });
});

// Endpoint daftar menu
app.get("/menu", (req, res) => {
  res.json({
    message: "Daftar menu makanan",
    server: SERVER_NAME,
    menus
  });
});

// Setiap instance memproses pesanan dan mengirim identitasnya lewat processedBy.
app.post("/orders", (req, res) => {
  const { menuId, quantity } = req.body;

  const menu = menus.find(
    (item) => item.id === Number(menuId)
  );

  const qty = Number(quantity);

  if (!menu || !Number.isInteger(qty) || qty < 1) {
    return res.status(400).json({
      message: "Menu atau jumlah pesanan tidak valid",
      processedBy: SERVER_NAME
    });
  }

  const order = {
    orderId: `ORD-${crypto.randomUUID()}`,
    menu: menu.name,
    quantity: qty,
    price: menu.price,
    total: menu.price * qty
  };

  console.log("Pesanan baru:", order);

  res.status(201).json({
    message: "Pesanan berhasil dibuat",
    order,
    processedBy: SERVER_NAME
  });
});

// Dipanggil load balancer berkala; respons 2xx dengan status UP berarti backend sehat.
app.get("/health", (req, res) => {
  res.json({
    server: SERVER_NAME,
    port: PORT,
    status: "UP"
  });
});

app.listen(PORT, () => {
  console.log(
    `${SERVER_NAME} berjalan pada http://localhost:${PORT}`
  );
});
