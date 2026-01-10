const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

let sessions = {};

// ---------- PRODUCTS ----------
const PRODUCTS = {
  buffalo: { name: "Buffalo Milk", price: 100, type: "MILK" },
  cow: { name: "Cow Milk", price: 120, type: "MILK" },
  paneer: { name: "Paneer", price: 600, type: "PANEER" },
  ghee: { name: "Ghee", price: 1000, type: "GHEE" }
};

// ---------- WEBHOOK ----------
app.post("/webhook", async (req, res) => {
  const entry = req.body.entry?.[0]?.changes?.[0]?.value;
  const msg = entry?.messages?.[0];
  if (!msg) return res.sendStatus(200);

  const from = msg.from;
  const type = msg.type;

  if (!sessions[from]) sessions[from] = { step: "MENU" };
  const s = sessions[from];

  // ---------- BUTTON CLICK ----------
  if (type === "interactive") {
    const id = msg.interactive.button_reply.id;

    // BACK BUTTON
    if (id === "BACK") {
      s.step = "MENU";
      return sendMainMenu(from);
    }

    switch (s.step) {

      // ---------- PRODUCT ----------
      case "MENU":
        s.product = PRODUCTS[id];
        s.step = "QUANTITY";
        return sendQuantityMenu(from, s.product);

      // ---------- QUANTITY ----------
      case "QUANTITY":
        s.quantity = id;
        s.price = calculatePrice(s.product, id);
        s.step = "ADDRESS_OPTION";
        return sendAddressOption(from);

      // ---------- ADDRESS OPTION ----------
      case "ADDRESS_OPTION":
        if (id === "TYPE") {
          s.step = "ADDRESS_TEXT";
          return sendText(from, "✍️ Please type your full address");
        }
        if (id === "LOCATION") {
          s.address = "Live Location Shared";
          s.step = "DELIVERY_SLOT";
          return sendDeliverySlot(from);
        }
        break;

      // ---------- DELIVERY SLOT ----------
      case "DELIVERY_SLOT":
        s.slot = id;
        s.step = "TIME";
        return sendText(from, "🕒 Enter delivery time (example: 6:30 AM)");

      // ---------- CONFIRM ----------
      case "CONFIRM":
        if (id === "CONFIRM") {
          await sendText(from,
`✅ *Order Confirmed!*

🙏 Thank you for ordering from
*Bala Milk Store* 🥛`);
          delete sessions[from];
        } else {
          await sendText(from, "❌ Order Cancelled");
          delete sessions[from];
        }
        break;
    }
  }

  // ---------- TEXT INPUT ----------
  if (type === "text") {
    const text = msg.text.body;

    if (s.step === "ADDRESS_TEXT") {
      s.address = text;
      s.step = "DELIVERY_SLOT";
      return sendDeliverySlot(from);
    }

    if (s.step === "TIME") {
      s.time = text;
      s.step = "CONFIRM";
      return sendOrderSummary(from, s);
    }
  }

  res.sendStatus(200);
});

// ---------- SEND FUNCTIONS ----------

async function sendMainMenu(to) {
  await sendButtons(
    to,
    "🥛 *Welcome to Bala Milk Store*\nChoose a product:",
    [
      { id: "buffalo", title: "Buffalo Milk ₹100/L" },
      { id: "cow", title: "Cow Milk ₹120/L" },
      { id: "paneer", title: "Paneer ₹600/Kg" }
    ]
  );
}

async function sendQuantityMenu(to, product) {
  let buttons = [];

  if (product.type === "MILK") {
    buttons = [
      { id: "500ml", title: "500ml ₹" + product.price / 2 },
      { id: "1L", title: "1L ₹" + product.price },
      { id: "2L", title: "2L ₹" + product.price * 2 }
    ];
  } else {
    buttons = [
      { id: "250g", title: "250g ₹" + product.price / 4 },
      { id: "500g", title: "500g ₹" + product.price / 2 },
      { id: "1kg", title: "1Kg ₹" + product.price }
    ];
  }

  buttons.push({ id: "BACK", title: "⬅ Back" });

  await sendButtons(to, `🛒 *${product.name}*\nSelect quantity:`, buttons);
}

async function sendAddressOption(to) {
  await sendButtons(
    to,
    "📍 Choose delivery address option:",
    [
      { id: "TYPE", title: "✍️ Type Address" },
      { id: "LOCATION", title: "📍 Share Live Location" },
      { id: "BACK", title: "⬅ Back" }
    ]
  );
}

async function sendDeliverySlot(to) {
  await sendButtons(
    to,
    "⏰ Select delivery slot:",
    [
      { id: "Morning", title: "🌅 Morning" },
      { id: "Evening", title: "🌙 Evening" },
      { id: "BACK", title: "⬅ Back" }
    ]
  );
}

async function sendOrderSummary(to, s) {
  await sendButtons(
    to,
`🧾 *Order Summary*

🥛 Product: ${s.product.name}
📦 Quantity: ${s.quantity}
💰 Price: ₹${s.price}
📍 Address: ${s.address}
⏰ Slot: ${s.slot}
🕒 Time: ${s.time}

Confirm order?`,
    [
      { id: "CONFIRM", title: "✅ Confirm" },
      { id: "CANCEL", title: "❌ Cancel" }
    ]
  );
}

// ---------- UTIL ----------
function calculatePrice(product, qty) {
  const map = {
    "500ml": 0.5, "1L": 1, "2L": 2,
    "250g": 0.25, "500g": 0.5, "1kg": 1
  };
  return product.price * map[qty];
}

async function sendButtons(to, body, buttons) {
  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: {
          buttons: buttons.map(b => ({
            type: "reply",
            reply: { id: b.id, title: b.title }
          }))
        }
      }
    },
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

async function sendText(to, body) {
  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      text: { body }
    },
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

app.listen(PORT, () => console.log("✅ WhatsApp Bot Running"));
