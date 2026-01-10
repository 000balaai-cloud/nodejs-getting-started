import express from "express";
import axios from "axios";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());

/* ================== CONFIG ================== */
const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

/* ================== SESSION ================== */
const sessions = {};

/* ================== WEBHOOK VERIFY ================== */
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified");
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

/* ================== WEBHOOK RECEIVE ================== */
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const msg = change?.value?.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const text = msg.text?.body;
    const replyId = msg.button?.payload;

    if (!sessions[from]) {
      sessions[from] = {
        step: "MENU",
        product: null,
        price: 0,
        qty: null,
        total: 0,
        address: null,
        location: null,
        deliveryTime: null
      };
      await sendMenu(from);
      return res.sendStatus(200);
    }

    const s = sessions[from];

    /* -------- LOCATION HANDLING -------- */
    if (msg.location && s.step === "LOCATION") {
      s.location = msg.location;
      s.step = "DELIVERY_TIME";
      await sendDeliveryTime(from);
      return res.sendStatus(200);
    }

    /* -------- BACK BUTTON -------- */
    if (replyId === "BACK") {
      s.step = "MENU";
      await sendMenu(from);
      return res.sendStatus(200);
    }

    switch (s.step) {
      case "MENU":
        handleMenu(replyId, s);
        await sendQuantity(from, s);
        s.step = "QTY";
        break;

      case "QTY":
        handleQty(replyId, s);
        if (!s.qty) {
          await sendQuantity(from, s);
          break;
        }
        s.step = "ADDRESS";
        await sendText(from, "🏠 *Please enter your delivery address:*");
        break;

      case "ADDRESS":
        if (!text) {
          await sendText(from, "❌ Please type your address.");
          break;
        }
        s.address = text;
        s.step = "LOCATION";
        await sendText(from, "📍 *Please share your live location using WhatsApp location option*");
        break;

      case "DELIVERY_TIME":
        const times = {
          MORNING: "Morning (6–9 AM)",
          EVENING: "Evening (5–8 PM)",
          CUSTOM: "Custom Time"
        };
        if (!times[replyId]) {
          await sendDeliveryTime(from);
          break;
        }
        s.deliveryTime = times[replyId];
        s.step = "CONFIRM";
        await sendConfirm(from, s);
        break;

      case "CONFIRM":
        if (replyId === "CONFIRM") {
          await sendText(from, "✅ *Order confirmed!* 🥛\nThank you for ordering from Bala Milk Store.");
          delete sessions[from];
        }
        break;
    }

    res.sendStatus(200);
  } catch (e) {
    console.error("Webhook Error:", e.response?.data || e);
    res.sendStatus(200);
  }
});

/* ================== HANDLERS ================== */
function handleMenu(id, s) {
  const map = {
    BUFFALO: ["Buffalo Milk", 100],
    COW: ["Cow Milk", 120],
    PANEER: ["Paneer", 600],
    GHEE: ["Ghee", 1000]
  };
  if (map[id]) {
    s.product = map[id][0];
    s.price = map[id][1];
  }
}

function handleQty(id, s) {
  const map = {
    Q500: [0.5, s.price * 0.5],
    Q1: [1, s.price],
    Q2: [2, s.price * 2]
  };
  if (map[id]) {
    s.qty = map[id][0] + " L";
    s.total = map[id][1];
  }
}

/* ================== SENDERS ================== */
async function sendMenu(to) {
  await sendButtons(
    to,
    `🥛 *Welcome to Bala Milk Store*\n\nChoose an option:`,
    [
      { id: "BUFFALO", title: "Buffalo Milk" },
      { id: "COW", title: "Cow Milk" },
      { id: "PANEER", title: "Paneer / Ghee" }
    ]
  );
}

async function sendQuantity(to, s) {
  await sendButtons(
    to,
    `🧾 *${s.product}*\n\nChoose quantity:\n\n` +
    `500 ml – ₹${s.price * 0.5}\n` +
    `1 L – ₹${s.price}\n` +
    `2 L – ₹${s.price * 2}`,
    [
      { id: "Q500", title: "500 ml" },
      { id: "Q1", title: "1 L" },
      { id: "Q2", title: "2 L" }
    ]
  );
}

async function sendDeliveryTime(to) {
  await sendButtons(
    to,
    "⏰ *Select Delivery Time*",
    [
      { id: "MORNING", title: "Morning (6–9 AM)" },
      { id: "EVENING", title: "Evening (5–8 PM)" },
      { id: "CUSTOM", title: "Custom Time" }
    ]
  );
}

async function sendConfirm(to, s) {
  await sendButtons(
    to,
    `🧾 *Confirm Order*\n\n` +
    `🛒 ${s.product}\n` +
    `📦 ${s.qty}\n` +
    `💰 ₹${s.total}\n\n` +
    `🏠 ${s.address}\n` +
    `⏰ ${s.deliveryTime}`,
    [
      { id: "CONFIRM", title: "Confirm ✅" },
      { id: "BACK", title: "⬅ Back" }
    ]
  );
}

async function sendText(to, body) {
  await axios.post(
    `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body }
    },
    { headers: { Authorization: `Bearer ${TOKEN}` } }
  );
}

async function sendButtons(to, body, buttons) {
  await axios.post(
    `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: {
          buttons: buttons.slice(0, 3).map(b => ({
            type: "reply",
            reply: { id: b.id, title: b.title }
          }))
        }
      }
    },
    { headers: { Authorization: `Bearer ${TOKEN}` } }
  );
}

/* ================== START SERVER ================== */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server running on port", PORT));
