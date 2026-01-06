const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ===== CONFIG =====
const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL;
const UPI_ID = "8121893882-2@ybl";

let sessions = {};

// ===== WEBHOOK =====
app.post("/webhook", async (req, res) => {
  try {
    const msg = req.body?.data?.body?.trim();
    const from = req.body?.data?.from;
    const name = req.body?.data?.notifyName || "";

    if (!from || !msg) {
      return res.sendStatus(200);
    }

    if (!sessions[from]) {
      sessions[from] = { step: "MENU", phone: from, name };
    }

    const s = sessions[from];
    let reply = "";

    // BACK
    if (msg === "0") s.step = "MENU";

    switch (s.step) {

      case "MENU":
        reply =
`🥛 *Welcome to Bala Milk Dairy*

1️⃣ Buffalo Milk – ₹100/L
2️⃣ Cow Milk – ₹120/L
3️⃣ Paneer – ₹600/Kg
4️⃣ Ghee – ₹1000/Kg
5️⃣ Enquiry

Reply with option number.`;
        s.step = "PRODUCT";
        break;

      case "PRODUCT":
        if (msg === "5") {
          reply = "✍️ Please type your enquiry.";
          s.step = "ENQUIRY";
          break;
        }

        const products = {
          "1": { name: "Buffalo Milk", price: 100 },
          "2": { name: "Cow Milk", price: 120 },
          "3": { name: "Paneer", price: 600 },
          "4": { name: "Ghee", price: 1000 }
        };

        if (!products[msg]) {
          reply = "❌ Invalid option. Try again.";
          break;
        }

        s.product = products[msg];
        reply =
`🧾 *${s.product.name}*

1️⃣ 500ml – ₹${s.product.price / 2}
2️⃣ 1L – ₹${s.product.price}
3️⃣ 2L – ₹${s.product.price * 2}

0️⃣ Back`;
        s.step = "QUANTITY";
        break;

      case "QUANTITY":
        reply =
`📍 Delivery Address:
1️⃣ Type address
2️⃣ Share live location`;
        s.step = "ADDRESS";
        break;

      case "ADDRESS":
        s.address = msg;
        reply =
`💰 Payment:
1️⃣ UPI
2️⃣ Cash on Delivery`;
        s.step = "PAYMENT";
        break;

      case "PAYMENT":
        if (msg === "1") {
          reply =
`💳 Pay via UPI:
👉 ${UPI_ID}

📸 Send screenshot after payment`;
        } else {
          reply = "✅ Order confirmed. Pay on delivery.";
        }
        delete sessions[from];
        break;
    }

    await sendMessage(from, reply);
    res.sendStatus(200);

  } catch (err) {
    console.error(err);
    res.sendStatus(200);
  }
});

// ===== START SERVER =====
app.get("/", (req, res) => {
  res.send("WhatsApp Bot is running ✅");
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});

// ===== SEND MESSAGE =====
async function sendMessage(to, body) {
  await axios.post(WHATSAPP_API_URL, {
    to,
    body
  });
}
