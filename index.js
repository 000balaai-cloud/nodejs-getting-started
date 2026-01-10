import express from "express";
import axios from "axios";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());

/* ================= CONFIG ================= */
const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

/* ================= SESSION STORE ================= */
const sessions = {};

/* ================= WEBHOOK VERIFY ================= */
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

/* ================= WEBHOOK RECEIVE ================= */
app.post("/webhook", async (req, res) => {
  try {
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const replyId =
      msg.interactive?.list_reply?.id ||
      msg.interactive?.button_reply?.id;

    if (!sessions[from]) {
      sessions[from] = { step: "MENU" };
      await sendMainMenu(from);
      return res.sendStatus(200);
    }

    const s = sessions[from];

    /* ===== LOCATION ===== */
    if (msg.location && s.step === "LOCATION") {
      s.location = msg.location;
      s.step = "DELIVERY_TIME";
      await sendDeliveryTime(from);
      return res.sendStatus(200);
    }

    /* ===== BACK ===== */
    if (replyId === "BACK") {
      s.step = "MENU";
      await sendMainMenu(from);
      return res.sendStatus(200);
    }

    /* ===== FLOW ===== */
    switch (s.step) {
      case "MENU":
        selectProduct(replyId, s);
        if (!s.product) {
          await sendMainMenu(from);
          break;
        }
        s.step = "QTY";
        await sendQuantity(from, s);
        break;

      case "QTY":
        selectQuantity(replyId, s);
        if (!s.qty) {
          await sendQuantity(from, s);
          break;
        }
        s.step = "ADDRESS";
        await sendText(from, "🏠 Please type your delivery address");
        break;

      case "ADDRESS":
        s.address = msg.text?.body;
        if (!s.address) {
          await sendText(from, "❌ Please type address");
          break;
        }
        s.step = "LOCATION";
        await sendText(from, "📍 Please share your live location");
        break;

      case "DELIVERY_TIME":
        s.deliveryTime = replyId;
        if (!s.deliveryTime) {
          await sendDeliveryTime(from);
          break;
        }
        s.step = "CONFIRM";
        await sendConfirm(from, s);
        break;

      case "CONFIRM":
        if (replyId === "CONFIRM") {
          await sendText(from, "✅ Order confirmed 🥛");
          delete sessions[from];
        }
        break;
    }

    res.sendStatus(200);
  } catch (e) {
    console.error(e.response?.data || e);
    res.sendStatus(200);
  }
});

/* ================= HELPERS ================= */
function selectProduct(id, s) {
  const map = {
    BUFFALO: ["Buffalo Milk", 100],
    COW: ["Cow Milk", 120],
    PANEER: ["Paneer", 600],
    GHEE: ["Ghee", 1000],
    SUB: ["Daily Subscription", 0],
    OWNER: ["Talk to Owner", 0]
  };
  if (map[id]) {
    s.product = map[id][0];
    s.price = map[id][1];
  }
}

function selectQuantity(id, s) {
  const map = {
    Q500: ["500 ml", s.price * 0.5],
    Q1: ["1 L", s.price],
    Q2: ["2 L", s.price * 2]
  };
  if (map[id]) {
    s.qty = map[id][0];
    s.total = map[id][1];
  }
}

/* ================= SENDERS ================= */
async function sendMainMenu(to) {
  await axios.post(
    `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: "🥛 *Bala Milk Store*\nChoose an option" },
        action: {
          button: "View Menu",
          sections: [
            {
              title: "Products",
              rows: [
                { id: "BUFFALO", title: "Buffalo Milk – ₹100/L" },
                { id: "COW", title: "Cow Milk – ₹120/L" },
                { id: "PANEER", title: "Paneer – ₹600/Kg" },
                { id: "GHEE", title: "Ghee – ₹1000/Kg" },
                { id: "SUB", title: "Daily Milk Subscription" },
                { id: "OWNER", title: "Talk to Owner" }
              ]
            }
          ]
        }
      }
    },
    { headers: { Authorization: `Bearer ${TOKEN}` } }
  );
}

async function sendQuantity(to, s) {
  await sendButtons(
    to,
    `🛒 ${s.product}\nChoose quantity\n\n` +
      `500 ml – ₹${s.price * 0.5}\n1 L – ₹${s.price}\n2 L – ₹${s.price * 2}`,
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
    "⏰ Choose delivery time",
    [
      { id: "Morning", title: "Morning" },
      { id: "Evening", title: "Evening" },
      { id: "BACK", title: "⬅ Back" }
    ]
  );
}

async function sendConfirm(to, s) {
  await sendButtons(
    to,
    `🧾 Confirm Order\n\n${s.product}\n${s.qty}\n₹${s.total}\n${s.address}`,
    [
      { id: "CONFIRM", title: "Confirm ✅" },
      { id: "BACK", title: "⬅ Back" }
    ]
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
          buttons: buttons.map(b => ({
            type: "reply",
            reply: { id: b.id, title: b.title }
          }))
        }
      }
    },
    { headers: { Authorization: `Bearer ${TOKEN}` } }
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

/* ================= START ================= */
app.listen(10000, () => console.log("Server running"));
