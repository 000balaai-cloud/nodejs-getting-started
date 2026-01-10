import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.PHONE_NUMBER_ID;
const PORT = process.env.PORT || 10000;

// simple in-memory session
const sessions = {};

app.get("/", (req, res) => res.send("Bot Running ✅"));

/* ---------------- VERIFY ---------------- */
app.get("/webhook", (req, res) => {
  if (req.query["hub.verify_token"] === "mytoken123") {
    return res.send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

/* ---------------- WEBHOOK ---------------- */
app.post("/webhook", async (req, res) => {
  try {
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    sessions[from] ||= {};

    console.log("INCOMING:", JSON.stringify(msg, null, 2));

    if (msg.type === "text") {
      if (msg.text.body.toLowerCase() === "hi") {
        return sendMainMenu(from);
      }

      // address typed
      if (sessions[from].step === "ADDRESS_TEXT") {
        sessions[from].address = msg.text.body;
        return askDeliveryTime(from);
      }
    }

    if (msg.type === "location") {
      sessions[from].location = msg.location;
      return askDeliveryTime(from);
    }

    if (msg.type === "interactive") {
      await handleButton(from, msg.interactive.button_reply.id);
    }

    res.sendStatus(200);
  } catch (e) {
    console.error(e.response?.data || e.message);
    res.sendStatus(200);
  }
});

/* ---------------- BUTTON HANDLER ---------------- */
async function handleButton(to, id) {
  if (id === "BACK") return sendMainMenu(to);

  // PRODUCTS
  if (["BUFFALO", "COW", "PANEER", "GHEE"].includes(id)) {
    sessions[to] = { product: id };
    return askQuantity(to, id);
  }

  // QUANTITY
  if (id.startsWith("Q_")) {
    const [_, qty, price] = id.split("_");
    sessions[to].quantity = qty;
    sessions[to].price = price;
    return askAddress(to);
  }

  // DELIVERY TIME
  if (id === "MORNING" || id === "EVENING") {
    sessions[to].delivery = id;
    return sendSummary(to);
  }

  if (id === "CONFIRM") {
    await sendText(to, "✅ Order Confirmed!\nThank you 🙏");
    delete sessions[to];
    return;
  }

  if (id === "CANCEL") {
    await sendText(to, "❌ Order Cancelled");
    delete sessions[to];
    return;
  }
}

/* ---------------- MENUS ---------------- */
async function sendMainMenu(to) {
  await sendButtons(to,
    "🥛 *Bala Milk Store*\nSelect Product",
    [
      { id: "BUFFALO", title: "🐃 Buffalo Milk" },
      { id: "COW", title: "🐄 Cow Milk" },
      { id: "PANEER", title: "🧀 Paneer" }
    ]
  );

  await sendButtons(to,
    "More options",
    [
      { id: "GHEE", title: "🧈 Ghee" },
      { id: "BACK", title: "⬅ Back" }
    ]
  );
}

/* ---------------- QUANTITY ---------------- */
async function askQuantity(to, product) {
  let options = [];

  if (product === "BUFFALO")
    options = [
      { id: "Q_500ml_50", title: "500ml – ₹50" },
      { id: "Q_1L_100", title: "1L – ₹100" },
      { id: "Q_2L_200", title: "2L – ₹200" }
    ];

  if (product === "PANEER")
    options = [
      { id: "Q_250g_150", title: "250g – ₹150" },
      { id: "Q_500g_300", title: "500g – ₹300" },
      { id: "Q_1kg_600", title: "1Kg – ₹600" }
    ];

  await sendButtons(to, "Select Quantity", options);
}

/* ---------------- ADDRESS ---------------- */
async function askAddress(to) {
  sessions[to].step = "ADDRESS_TEXT";
  await sendText(to, "✍️ Please type delivery address\nOR share live location 📍");
}

/* ---------------- DELIVERY TIME ---------------- */
async function askDeliveryTime(to) {
  await sendButtons(to,
    "Select Delivery Time",
    [
      { id: "MORNING", title: "🌅 Morning" },
      { id: "EVENING", title: "🌙 Evening" }
    ]
  );
}

/* ---------------- SUMMARY ---------------- */
async function sendSummary(to) {
  const s = sessions[to];
  await sendButtons(
    to,
    `🧾 *Order Summary*\n
Product: ${s.product}
Quantity: ${s.quantity}
Price: ₹${s.price}
Delivery: ${s.delivery}`,
    [
      { id: "CONFIRM", title: "✅ Confirm Order" },
      { id: "CANCEL", title: "❌ Cancel" }
    ]
  );
}

/* ---------------- HELPERS ---------------- */
async function sendButtons(to, text, buttons) {
  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text },
        action: { buttons: buttons.slice(0, 3).map(b => ({
          type: "reply",
          reply: b
        })) }
      }
    },
    { headers: { Authorization: `Bearer ${TOKEN}` } }
  );
}

async function sendText(to, text) {
  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      text: { body: text }
    },
    { headers: { Authorization: `Bearer ${TOKEN}` } }
  );
}

app.listen(PORT, () => console.log("🚀 Server running"));
