const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL;
const TOKEN = process.env.WHATSAPP_TOKEN;

let sessions = {};

const PRODUCTS = {
  "1": { name: "Buffalo Milk", price: 100 },
  "2": { name: "Cow Milk", price: 120 },
  "3": { name: "Paneer", price: 600 },
  "4": { name: "Ghee", price: 1000 },
};

// ---------------- WEBHOOK ----------------
app.post("/webhook", async (req, res) => {
  const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msg) return res.sendStatus(200);

  const from = msg.from;
  const text = msg.text?.body?.trim();

  if (!sessions[from]) {
    sessions[from] = { step: "MENU", phone: from };
  }

  const s = sessions[from];

  // BACK
  if (text === "0") s.step = "MENU";

  switch (s.step) {

    // ---------------- MENU ----------------
    case "MENU":
      s.step = "PRODUCT";
      await sendText(from,
`🥛 *Welcome to Bala Milk Store*

1️⃣ Buffalo Milk – ₹100/L
2️⃣ Cow Milk – ₹120/L
3️⃣ Paneer – ₹600/Kg
4️⃣ Ghee – ₹1000/Kg
5️⃣ Daily Milk Subscription
6️⃣ Talk to Owner

Reply with option number`);
      break;

    // ---------------- PRODUCT ----------------
    case "PRODUCT":
      if (!PRODUCTS[text]) {
        await sendText(from, "❌ Invalid option\n0️⃣ Back");
        break;
      }

      s.product = PRODUCTS[text];
      s.step = "QUANTITY";

      await sendText(from,
`🛒 *${s.product.name}*
Price: ₹${s.product.price} per unit

Select Quantity:
1️⃣ 500ml / 0.5 Kg – ₹${s.product.price / 2}
2️⃣ 1 Unit – ₹${s.product.price}
3️⃣ 2 Units – ₹${s.product.price * 2}

0️⃣ Back`);
      break;

    // ---------------- QUANTITY ----------------
    case "QUANTITY":
      const qtyMap = {
        "1": { label: "0.5", mul: 0.5 },
        "2": { label: "1", mul: 1 },
        "3": { label: "2", mul: 2 },
      };

      if (!qtyMap[text]) {
        await sendText(from, "❌ Choose valid quantity\n0️⃣ Back");
        break;
      }

      s.quantity = qtyMap[text].label;
      s.total = s.product.price * qtyMap[text].mul;
      s.step = "ADDRESS_OPTION";

      await sendText(from,
`📍 *Delivery Address*
Choose one option:

1️⃣ Type Address
2️⃣ Share Live Location

0️⃣ Back`);
      break;

    // ---------------- ADDRESS OPTION ----------------
    case "ADDRESS_OPTION":
      if (text === "1") {
        s.step = "ADDRESS_TEXT";
        await sendText(from, "✍️ Please type your full address\n0️⃣ Back");
      } else if (text === "2") {
        s.step = "LOCATION";
        await sendText(from, "📍 Please share your live location");
      } else {
        await sendText(from, "❌ Invalid option\n0️⃣ Back");
      }
      break;

    case "ADDRESS_TEXT":
      s.address = text;
      s.step = "DELIVERY";
      await sendText(from,
`⏰ Select Delivery Slot:
1️⃣ Morning
2️⃣ Evening

0️⃣ Back`);
      break;

    case "LOCATION":
      s.address = "Live Location Shared";
      s.step = "DELIVERY";
      await sendText(from,
`⏰ Select Delivery Slot:
1️⃣ Morning
2️⃣ Evening

0️⃣ Back`);
      break;

    // ---------------- DELIVERY ----------------
    case "DELIVERY":
      if (text === "1") s.slot = "Morning";
      else if (text === "2") s.slot = "Evening";
      else {
        await sendText(from, "❌ Invalid option\n0️⃣ Back");
        break;
      }

      s.step = "TIME";
      await sendText(from, "🕒 Enter delivery time (example: 6:30 AM)\n0️⃣ Back");
      break;

    // ---------------- TIME ----------------
    case "TIME":
      s.time = text;
      s.step = "CONFIRM";

      await sendText(from,
`🧾 *ORDER SUMMARY*

━━━━━━━━━━━━━━
🥛 Product : ${s.product.name}
📦 Quantity : ${s.quantity}
💰 Price    : ₹${s.total}
📍 Address  : ${s.address}
⏰ Delivery : ${s.slot} – ${s.time}
━━━━━━━━━━━━━━

1️⃣ Confirm Order
2️⃣ Cancel Order
0️⃣ Back`);
      break;

    // ---------------- CONFIRM ----------------
    case "CONFIRM":
      if (text === "1") {
        await sendText(from,
`✅ *Order Confirmed!*

🙏 Thank you for ordering from
*Bala Milk Store* 🥛

We will contact you shortly.`);
        delete sessions[from];
      } else {
        await sendText(from, "❌ Order Cancelled");
        delete sessions[from];
      }
      break;
  }

  res.sendStatus(200);
});

// ---------------- SEND MESSAGE ----------------
async function sendText(to, body) {
  await axios.post(
    WHATSAPP_API_URL,
    {
      messaging_product: "whatsapp",
      to,
      text: { body }
    },
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );
}

app.listen(PORT, () => console.log("Webhook running on port", PORT));
