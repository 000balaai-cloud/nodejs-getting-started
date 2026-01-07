const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ===== CONFIG =====
const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL;
const UPI_ID = "8121893882-2@ybl";

// ===== SESSION STORE =====
const sessions = {};

// ===== WEBHOOK =====
app.post("/webhook", async (req, res) => {
  try {
    const data = req.body.data || {};
    const text = (data.body || "").trim();
    const from = data.from;
    const name = data.notifyName || "";

    if (!from) return res.sendStatus(200);

    if (!sessions[from]) {
      sessions[from] = {
        step: "MENU",
        phone: from,
        name
      };
    }

    const s = sessions[from];

    // BACK OPTION
    if (text === "0") {
      s.step = "MENU";
    }

    let reply = "";

    switch (s.step) {

      // ========= MENU =========
      case "MENU":
        reply =
`🥛 *Welcome to Bala Milk Dairy*

Please choose an option:
1️⃣ Buffalo Milk – ₹100/L
2️⃣ Cow Milk – ₹120/L
3️⃣ Paneer – ₹600/Kg
4️⃣ Ghee – ₹1000/Kg
5️⃣ Daily Milk Subscription
6️⃣ Enquiry Only

Reply with option number.`;
        s.step = "PRODUCT";
        break;

      // ========= PRODUCT =========
      case "PRODUCT":
        if (text === "6") {
          s.type = "Enquiry";
          s.step = "ENQUIRY";
          reply = "✍️ Please type your enquiry.\n\n0️⃣ Back";
          break;
        }

        const products = {
          "1": { name: "Buffalo Milk", price: 100 },
          "2": { name: "Cow Milk", price: 120 },
          "3": { name: "Paneer", price: 600 },
          "4": { name: "Ghee", price: 1000 }
        };

        if (!products[text]) {
          reply = "❌ Invalid option\n\n0️⃣ Back";
          break;
        }

        s.product = products[text];

        reply =
`🧾 *${s.product.name}*

Price: ₹${s.product.price}

Choose quantity:
1️⃣ 500ml – ₹${s.product.price / 2}
2️⃣ 1 L – ₹${s.product.price}
3️⃣ 2 L – ₹${s.product.price * 2}

0️⃣ Back`;

        s.step = "QUANTITY";
        break;

      // ========= QUANTITY =========
      case "QUANTITY":
        const qtyMap = {
          "1": { label: "500ml", multiplier: 0.5 },
          "2": { label: "1L", multiplier: 1 },
          "3": { label: "2L", multiplier: 2 }
        };

        if (!qtyMap[text]) {
          reply = "❌ Invalid quantity\n\n0️⃣ Back";
          break;
        }

        s.quantity = qtyMap[text].label;
        s.price = s.product.price * qtyMap[text].multiplier;

        reply =
`📍 Delivery Address:
1️⃣ Send live location
2️⃣ Type address manually

0️⃣ Back`;

        s.step = "ADDRESS";
        break;

      // ========= ADDRESS =========
      case "ADDRESS":
        if (text === "1") {
          reply = "📌 Please share live location now.";
          s.step = "LOCATION";
        } else if (text === "2") {
          reply = "✍️ Please type your full address.\n\n0️⃣ Back";
          s.step = "ADDRESS_TEXT";
        } else {
          reply = "❌ Invalid option\n\n0️⃣ Back";
        }
        break;

      case "LOCATION":
        s.address = "Live Location Shared";
        reply =
`⏰ Delivery Slot:
1️⃣ Morning
2️⃣ Evening

0️⃣ Back`;
        s.step = "DELIVERY";
        break;

      case "ADDRESS_TEXT":
        s.address = text;
        reply =
`⏰ Delivery Slot:
1️⃣ Morning
2️⃣ Evening

0️⃣ Back`;
        s.step = "DELIVERY";
        break;

      // ========= DELIVERY =========
      case "DELIVERY":
        if (text === "1") s.delivery = "Morning";
        else if (text === "2") s.delivery = "Evening";
        else {
          reply = "❌ Invalid option\n\n0️⃣ Back";
          break;
        }

        reply =
`🕒 Enter delivery time
Example: 6:30 AM

0️⃣ Back`;
        s.step = "TIME";
        break;

      case "TIME":
        s.deliveryTime = `${s.delivery} ${text}`;

        reply =
`💰 Payment Method:
1️⃣ UPI
2️⃣ Cash on Delivery

0️⃣ Back`;
        s.step = "PAYMENT";
        break;

      // ========= PAYMENT =========
      case "PAYMENT":
        if (text === "1") {
          reply =
`💳 *UPI Payment*

Pay to:
👉 ${UPI_ID}

📸 After payment, send screenshot.

0️⃣ Back`;
          s.step = "SCREENSHOT";
        } else if (text === "2") {
          reply =
`✅ *Order Confirmed!*

Product: ${s.product.name}
Quantity: ${s.quantity}
Price: ₹${s.price}

🙏 Thank you for ordering from *Bala Milk Dairy* 🥛`;
          delete sessions[from];
        } else {
          reply = "❌ Invalid option\n\n0️⃣ Back";
        }
        break;

      // ========= SCREENSHOT =========
      case "SCREENSHOT":
        reply =
`✅ *Payment received!*

Product: ${s.product.name}
Quantity: ${s.quantity}
Price: ₹${s.price}

🙏 Thank you for ordering from *Bala Milk Dairy* 🥛`;
        delete sessions[from];
        break;

      // ========= ENQUIRY =========
      case "ENQUIRY":
        reply =
`🙏 Thank you for contacting *Bala Milk Dairy*.
Our team will get back to you soon.`;
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

// ===== SEND MESSAGE =====
async function sendMessage(to, body) {
  await axios.post(WHATSAPP_API_URL, {
    to,
    body
  });
}

// ===== SERVER =====
app.get("/", (req, res) => {
  res.send("Bala Milk Dairy Bot is running");
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
