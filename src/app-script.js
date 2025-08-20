// app-script.js
import {
  ensureAnonAuth,
  sendChatMessage,
  subscribeChat,
  onAuthChanged,
} from "./firebase";
import LoginBar from "./components/LoginBar.vue";

export default {
  name: "App",
  components: { LoginBar },

  data() {
    return {
      // ================== MAP / UI STATE ==================
      map: null,
      selectedMapType: "hybrid",
      dolEnabled: true,
      opacity: 0.85,
      activeTab: "dashboard",
      snapEnabled: true,
      wmsDol: null, // ชั้น DOL สำหรับ Longdo (WMS)
      leafletWmsDol: null, // (ถ้ามี Leaflet fallback)

      snapSettings: { red: 180, green: 90, blue: 90 },

      landData: {
        size: "",
        width: "",
        owner: "",
        phone: "",
        lineId: "",
        price: "",
      },
      savedLands: [],
      filteredLands: [],   // ← เพิ่มบรรทัดนี้

      currentLocation: { lat: 13.7563, lon: 100.5234 },
      currentZoom: 10,

      showSearch: false,
      showFilters: false,
      showLayers: false,

      searchQuery: "",
      filters: {
        landType: "",
        priceMin: "",
        priceMax: "",
        roadWidth: "", // ใหม่
        areaMin: "", // ใหม่
        areaMax: "", // ใหม่
        frontMin: "", // ใหม่
        frontMax: "", // ใหม่
      },

      availableLayers: [
        { id: 1, name: "ขอบเขตจังหวัด", visible: true },
        { id: 2, name: "ขอบเขตอำเภอ", visible: false },
        { id: 3, name: "ขอบเขตตำบล", visible: false },
        { id: 4, name: "ถนนหลัก", visible: true },
        { id: 5, name: "แหล่งน้ำ", visible: false },
      ],

      // ================== CHAT STATE ==================
      showChat: false,
      chatMessages: [],
      chatInput: "",
      currentUserId: null,
      userProfile: { name: "", joinedAt: null },
      tempUserName: "",
      hasNewMessage: false,
      unreadCount: 0,
      lastSeenMessageId: null,
      onlineUsers: 1,
      showTypingIndicator: false,
      typingTimer: null,
      chatUnsubscribe: null,
      authUnsubscribe: null,

      // ================== [SEARCH] STATE ==================
      myMarker: null,
      locating: false,
      geolocError: null,
    };
  },

  async mounted() {
    this.initMap();

    // อัปเดต currentUserId/ชื่อ ให้สอดคล้องกับการล็อกอิน (Google/Email/Anon)
    this.authUnsubscribe = onAuthChanged((u) => {
      if (u) {
        this.currentUserId = u.uid;
        // ถ้าล็อกอินจริง (ไม่ใช่ anonymous) และยังไม่ตั้งชื่อในแชท ให้เติมชื่ออัตโนมัติ
        if (!u.isAnonymous && !this.userProfile.name) {
          this.userProfile.name =
            u.displayName || (u.email ? u.email.split("@")[0] : "");
        }
      }
    });

    await this.initChat();
  },

  beforeUnmount() {
    if (this.chatUnsubscribe) this.chatUnsubscribe();
    if (this.typingTimer) clearTimeout(this.typingTimer);
    if (this.authUnsubscribe) this.authUnsubscribe();
  },

  methods: {
    // ================== MAP: DOL WMS ==================
    initDolWms_Longdo() {
      try {
        this.map?.Event?.bind?.("ready", () => {
          const lyr = new window.longdo.Layer("dol", {
            type: window.longdo.LayerType.WMS,
            url: "https://ms.longdo.com/mapproxy/service",
            format: "image/png",
            srs: "EPSG:3857",
            opacity: this.opacity ?? 0.85,
          });

          console.log(
            "[DOL WMS] constructed is longdo.Layer?",
            lyr instanceof window.longdo.Layer,
            lyr
          );

          this.wmsDol = lyr;
          if (this.dolEnabled) this.map.Layers.add(this.wmsDol);
        });
      } catch (e) {
        console.debug("initDolWms_Longdo error:", e);
      }
    },

    onChangeBaseMap(type) {
      if (!this.map || !window.longdo?.Layers) return;
      const key = (type || "").toUpperCase();
      const resolve = (v) => (typeof v === "function" ? v() : v);

      const B = window.longdo.Layers;
      const dict = {
        NORMAL: B.NORMAL,
        HYBRID: B.HYBRID,
        SATELLITE: B.SATELLITE,
        GRAY: B.GRAY,
      };
      const target = resolve(dict[key] || B.HYBRID);

      console.log(
        "setBase =>",
        key,
        "type=",
        typeof dict[key],
        "target=",
        target
      );
      try {
        if (this.map.Layers?.setBase) this.map.Layers.setBase(target);
        else if (this.map.Layers?.base) this.map.Layers.base(target);
      } catch (e) {
        console.error("setBase error:", e, "key=", key, "target=", target);
      }
    },

    // เปิด/ปิด + ปรับโปร่งใส (ถูกเรียกจาก checkbox/slider)
    applyDolVisibility() {
      try {
        if (!this.map?.Layers?.add || !this.wmsDol) return;

        this.wmsDol.opacity = this.opacity ?? 0.85;

        if (this.dolEnabled) {
          this.map.Layers.remove(this.wmsDol);
          this.map.Layers.add(this.wmsDol);
        } else {
          this.map.Layers.remove(this.wmsDol);
        }
      } catch (e) {
        console.debug("applyDolVisibility error:", e);
      }
    },

    onToggleDol() {
      this.applyDolVisibility();
    },

    onChangeDolOpacity() {
      this.applyDolVisibility();
    },

    // ================== MAP: INIT ==================
    initMap() {
      if (typeof window.longdo !== "undefined") {
        this.map = new window.longdo.Map({
          placeholder: document.getElementById("map"),
          language: "th",
          layer:
            typeof window.longdo.Layers.HYBRID === "function"
              ? window.longdo.Layers.HYBRID()
              : window.longdo.Layers.HYBRID,
        });

        this.map.location({
          lon: this.currentLocation.lon,
          lat: this.currentLocation.lat,
          includePolygon: false,
        });

        this.selectedMapType = "hybrid"; // sync dropdown

        this.initDolWms_Longdo();
        this.applyDolVisibility();
      } else {
        setTimeout(() => this.initMap(), 500);
      }
    },

    // ================== CHAT ==================
    async initChat() {
      try {
        this.currentUserId = await ensureAnonAuth();

        this.chatUnsubscribe = subscribeChat((messages) => {
          const previousLength = this.chatMessages.length;
          this.chatMessages = messages;

          if (messages.length > previousLength && !this.showChat) {
            this.hasNewMessage = true;
            this.unreadCount = Math.max(
              0,
              messages.length -
                (this.lastSeenMessageId
                  ? messages.findIndex((m) => m.id === this.lastSeenMessageId) +
                    1
                  : 0)
            );
          }

          this.$nextTick(() => this.scrollToBottom());
        });

        console.log("Chat initialized with user ID:", this.currentUserId);
      } catch (error) {
        console.error("Failed to initialize chat:", error);
      }
    },

    async setUserProfile() {
      if (this.tempUserName.trim()) {
        this.userProfile.name = this.tempUserName.trim();
        this.userProfile.joinedAt = Date.now();

        try {
          await sendChatMessage(
            `${this.userProfile.name} เข้าร่วมการสนทนา`,
            this.currentUserId,
            "ระบบ"
          );
        } catch (error) {
          console.error("Failed to send join message:", error);
        }
      }
    },

    async sendMessage() {
      if (!this.chatInput.trim() || !this.userProfile.name) return;

      try {
        const fallbackName = this.userProfile.name || "";
        await sendChatMessage(
          this.chatInput.trim(),
          this.currentUserId,
          fallbackName
        );
        this.chatInput = "";
      } catch (error) {
        console.error("Failed to send message:", error);
        alert("ไม่สามารถส่งข้อความได้ กรุณาลองใหม่อีกครั้ง");
      }
    },

    handleTyping() {
      if (this.typingTimer) clearTimeout(this.typingTimer);

      // แสดงกำลังพิมพ์
      this.showTypingIndicator = true;

      // เดี๋ยวปิดเองหลัง 2 วิ
      this.typingTimer = setTimeout(() => {
        this.showTypingIndicator = false; // <-- มีคำสั่งจริง แก้ ESLint no-empty
      }, 1000);
    },

    formatTime(timestamp) {
      if (!timestamp) return "";
      const date = new Date(timestamp);
      const now = new Date();
      const diffInMinutes = Math.floor((now - date) / (1000 * 60));
      if (diffInMinutes < 1) return "ตอนนี้";
      if (diffInMinutes < 60) return `${diffInMinutes} นาทีที่แล้ว`;
      if (diffInMinutes < 1440)
        return `${Math.floor(diffInMinutes / 60)} ชั่วโมงที่แล้ว`;
      return date.toLocaleDateString("th-TH", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    },

    scrollToBottom() {
      if (this.$refs.chatBody)
        this.$refs.chatBody.scrollTop = this.$refs.chatBody.scrollHeight;
    },

    toggleP2P() {
      this.showChat = !this.showChat;
      this.showSearch = false;
      this.showFilters = false;
      this.showLayers = false;

      if (this.showChat) {
        this.hasNewMessage = false;
        this.unreadCount = 0;
        if (this.chatMessages.length > 0) {
          this.lastSeenMessageId =
            this.chatMessages[this.chatMessages.length - 1].id;
        }
        this.$nextTick(() => this.scrollToBottom());
      }
    },

    centerBangkok() {
      if (!this.map) return;
      this.map.location({ lon: 100.5234, lat: 13.7563, includePolygon: false });
      this.currentLocation = { lat: 13.7563, lon: 100.5234 };
    },

    reloadAPI() {
      console.log("Reloading API...");
      this.initMap();
    },

    startDrawing() {
      console.log("Start drawing boundary");
    },
    finishDrawing() {
      console.log("Finish drawing");
    },
    clearDrawing() {
      console.log("Clear drawing");
    },
    applyFilters() {
  // ดึงค่าตัวกรอง
  const { roadWidth, areaMin, areaMax, priceMin, priceMax, frontMin, frontMax } = this.filters;

  // แปลงค่าว่าง -> null / ตัวเลข
  const parseNum = (v) => (v === "" || v === null || v === undefined) ? null : +v;

  // map ค่า roadWidth จาก dropdown -> ช่วงตัวเลข
  const roadMinMax = (rw) => {
    if (!rw) return [null, null];
    if (rw === "lt6") return [null, 6];
    if (rw === "6-9.99") return [6, 9.99];
    if (rw === "10-11.99") return [10, 11.99];
    if (rw === "12-17.99") return [12, 17.99];
    if (rw === "18-29.99") return [18, 29.99];
    if (rw === "ge30") return [30, null];
    return [null, null];
  };

  const [rwMin, rwMax] = roadMinMax(roadWidth);
  const aMin = parseNum(areaMin),  aMax = parseNum(areaMax);
  const pMin = parseNum(priceMin), pMax = parseNum(priceMax);
  const fMin = parseNum(frontMin), fMax = parseNum(frontMax);

  // หมายเหตุเรื่องชื่อฟิลด์ใน savedLands:
  //   - โค้ดตัวอย่างนี้ “คาดหวัง” ให้แต่ละรายการมี:
  //       area (ตร.วา), pricePerSqw (บาท/ตร.วา), frontage (เมตร), roadWidth (เมตร)
  //   - แต่จากโค้ดของคุณตอน saveLandData() เก็บเป็น: size, width, price
  //     เลยทำ adapter ให้รองรับทั้งสองแบบ

  const getArea      = (it) => (it.area != null ? +it.area : (it.size ? +it.size : 0));
  const getPriceSqw  = (it) => (it.pricePerSqw != null ? +it.pricePerSqw : (it.price ? +it.price : 0));
  const getFrontage  = (it) => (it.frontage != null ? +it.frontage : (it.width ? +it.width : 0));
  const getRoadWidth = (it) => (it.roadWidth != null ? +it.roadWidth : (it.road ? +it.road : null));

  if (Array.isArray(this.savedLands)) {
    this.filteredLands = this.savedLands.filter(item => {
      const area      = getArea(item);
      const priceSqw  = getPriceSqw(item);
      const frontage  = getFrontage(item);
      const rwidth    = getRoadWidth(item);

      const inArea  = (aMin==null || area     >= aMin)   && (aMax==null || area     <= aMax);
      const inPrice = (pMin==null || priceSqw >= pMin)   && (pMax==null || priceSqw <= pMax);
      const inFront = (fMin==null || frontage >= fMin)   && (fMax==null || frontage <= fMax);
      const inRoad  = (rwMin==null || (rwidth!=null && rwidth >= rwMin)) &&
                      (rwMax==null || (rwidth!=null && rwidth <= rwMax));

      return inArea && inPrice && inFront && inRoad;
    });
  } else {
    this.filteredLands = [];
  }

  this.showFilters = false;
},

    saveLandData() {
      if (this.landData.owner) {
        this.savedLands.push({ ...this.landData });
        this.landData = {
          size: "",
          width: "",
          owner: "",
          phone: "",
          lineId: "",
          price: "",
        };
        console.log("Land data saved:", this.savedLands);
      } else {
        alert("กรุณากรอกชื่อเจ้าของ");
      }
    },

    toggleSearch() {
      this.showSearch = !this.showSearch;
      this.showFilters = false;
      this.showLayers = false;
      this.showChat = false;
    },

    toggleFilters() {
      this.showFilters = !this.showFilters;
      this.showSearch = false;
      this.showLayers = false;
      this.showChat = false;
    },

    toggleLayers() {
      this.showLayers = !this.showLayers;
      this.showSearch = false;
      this.showFilters = false;
      this.showChat = false;
    },

    viewMyProperty() {
      console.log("View my property");
    },

    exploreArea() {
      console.log("Explore area");
    },

    // ================== [SEARCH] CORE: CENTER & GPS & GEOCODE ==================

    // [SEARCH] ย้ายแมพ + ปักหมุด (รับพิกัดในรูป (lon, lat))
    centerTo(lon, lat, zoom = 17) {
      if (!this.map) return;

      try {
        this.map.location({ lon, lat, includePolygon: false });
        if (typeof this.map.zoom === "function") this.map.zoom(zoom);
      } catch (e) {
        console.debug("[SEARCH] centerTo error:", e);
      }

      try {
        if (this.myMarker) this.map.Overlays.remove(this.myMarker);
        this.myMarker = new window.longdo.Marker({ lon, lat });
        this.map.Overlays.add(this.myMarker);
      } catch (e) {
        console.debug("[SEARCH] marker add failed:", e);
      }
    },

    // [SEARCH] ใช้ตำแหน่งผู้ใช้ (GPS)
    locateByGPS() {
      if (!("geolocation" in navigator)) {
        alert("เบราเซอร์นี้ไม่รองรับการระบุตำแหน่ง (Geolocation)");
        return;
      }
      this.locating = true;
      this.geolocError = null;

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          this.currentLocation = { lat: latitude, lon: longitude };
          this.centerTo(longitude, latitude, 18); // NOTE: centerTo(lon, lat)
          this.showSearch = false;
          this.locating = false;
        },
        (err) => {
          this.locating = false;
          this.geolocError = err?.message || "ขอสิทธิ์ตำแหน่งไม่สำเร็จ";
          alert("ไม่สามารถระบุตำแหน่งได้: " + this.geolocError);
        },
        { enableHighAccuracy: true, maximumAge: 20000, timeout: 10000 }
      );
    },

    // [SEARCH] โหลด Longdo Services แบบไดนามิกถ้ายังไม่พร้อม (ไม่ต้องใส่ ?key)
    async ensureLongdoServices() {
      if (window.longdo?.Services?.search) return true;

      // เผื่อ services กำลังโหลด (จาก main.js) รอสั้น ๆ ก่อน
      for (let i = 0; i < 15; i++) {
        if (window.longdo?.Services?.search) return true;
        await new Promise((r) => setTimeout(r, 200));
      }

      // ยังไม่มา → inject script ด้วย URL ที่ถูกต้อง
      const urls = [
        "https://api.longdo.com/services",
        "https://api.longdo.com/services/",
      ];

      for (const src of urls) {
        try {
          await new Promise((resolve, reject) => {
            const s = document.createElement("script");
            s.src = src;
            s.async = true;
            s.onload = resolve;
            s.onerror = () => reject(new Error("services load failed: " + src));
            document.head.appendChild(s);
          });
          if (window.longdo?.Services?.search) return true;
        } catch (e) {
          console.debug("[SEARCH] inject services failed:", src, e);
        }
      }

      return !!window.longdo?.Services?.search;
    },

    // [SEARCH] ค้นหาชื่อสถานที่ (Services ก่อน → REST สำรอง / ใช้ key เดียวจาก main.js)
    async searchPlaceLongdo(q) {
      // 1) พยายามใช้ Services ก่อน
      if (await this.ensureLongdoServices()) {
        return new Promise((resolve) => {
          try {
            window.longdo.Services.search(
              { keyword: q, limit: 5, language: "th" },
              (results) => {
                if (Array.isArray(results) && results.length > 0) {
                  const best = results[0];
                  if (best?.lon != null && best?.lat != null) {
                    this.centerTo(best.lon, best.lat, 17);
                    this.showSearch = false;
                    resolve(true);
                    return;
                  }
                }
                alert("ไม่พบผลลัพธ์จาก Longdo สำหรับ: " + q);
                resolve(false);
              },
              (err) => {
                console.debug("[SEARCH] Services.search error:", err);
                resolve(false); // ให้ไป REST ต่อ
              }
            );
          } catch (e) {
            console.debug("[SEARCH] Services.search exception:", e);
            // ไป REST ต่อ
          }
        });
      }

      // 2) Fallback → REST (ใช้ key เดียวจาก main.js)
      try {
        const KEY = window.__LONGDO_KEY; // ✅ แชร์ key เดียวจาก main.js
        const url =
          `https://search.longdo.com/mapsearch/json/search` +
          `?keyword=${encodeURIComponent(q)}` +
          `&key=${encodeURIComponent(KEY)}` +
          `&limit=5&language=th`;

        const r = await fetch(url);
        const text = await r.text(); // กันกรณีปลายทางตอบ error HTML
        const data = JSON.parse(text); // ถ้าไม่ใช่ JSON จะ throw ไป catch
        const items = Array.isArray(data?.data) ? data.data : [];
        if (items.length && items[0]?.lon != null && items[0]?.lat != null) {
          this.centerTo(items[0].lon, items[0].lat, 17);
          this.showSearch = false;
          return true;
        }
        alert("ไม่พบผลลัพธ์จาก Longdo สำหรับ: " + q);
        return false;
      } catch (e) {
        console.debug("[SEARCH] REST search error:", e);
        alert("ค้นหาไม่สำเร็จ (REST)");
        return false;
      }
    },

    // [SEARCH] ฟังก์ชันที่ปุ่ม "ค้นหา" เรียกใช้
    performSearch() {
      const q = (this.searchQuery || "").trim();

      // 1) ช่องว่าง → ใช้ GPS
      if (!q) {
        this.locateByGPS();
        return;
      }

      // 2) รองรับใส่พิกัด "lat, lon"
      const m = q.match(
        /^\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)\s*$/
      );
      if (m) {
        const lat = parseFloat(m[1]);
        const lon = parseFloat(m[2]);
        if (
          isFinite(lat) &&
          isFinite(lon) &&
          Math.abs(lat) <= 90 &&
          Math.abs(lon) <= 180
        ) {
          this.centerTo(lon, lat, 18);
          this.showSearch = false;
          return;
        }
      }

      // 3) ชื่อสถานที่ → ใช้ Longdo (Services → REST)
      this.searchPlaceLongdo(q);
    },
  },
};
