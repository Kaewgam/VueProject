<template>
  <div id="app">
    <header class="app-header">
      <h1>SQW</h1>
      <LoginBar />

      <RouterView v-if="false" />
    </header>

    <nav class="navbar">
      <!-- Map Controls Section -->

      <div class="control-section">
        <div class="section-header">ฐานแผนที่</div>
        <select class="form-select" v-model="selectedMapType" @change="onChangeBaseMap(selectedMapType)">
          <option value="satellite">Satellite</option>
          <option value="normal">Normal</option>
          <option value="hybrid">Hybrid</option>
        </select>

        <label class="checkbox-label">
          <input type="checkbox" v-model="dolEnabled" @change="onToggleDol" />
          <span class="checkmark">{{ dolEnabled ? '✓' : '' }}</span>
          DOL (WMS: dol)
        </label>

        <div class="opacity-control">
          <label>Opacity</label>
          <input type="range" min="0" max="1" step="0.01" v-model="opacity" class="slider"
            @input="onChangeDolOpacity" />
          <span class="opacity-value">{{ opacity }}</span>
        </div>

        <div class="button-group">
          <button class="btn btn-primary" @click="centerBangkok">
            Center: Bangkok
          </button>
          <button class="btn btn-secondary" @click="reloadAPI">
            Reload API
          </button>
        </div>

        <div class="engine-info">Engine: Leaflet (fallback)</div>
      </div>

      <!-- Navigation Buttons -->
      <div class="nav-buttons">
        <button class="nav-btn" :class="{ active: activeTab === 'dashboard' }" @click="activeTab = 'dashboard'">
          Dashboard
        </button>
        <button class="nav-btn" :class="{ active: activeTab === 'feature' }" @click="activeTab = 'feature'">
          GetFeatureInfo
        </button>
        <button class="nav-btn" :class="{ active: activeTab === 'status' }" @click="activeTab = 'status'">
          Status
        </button>
      </div>

      <!-- Action Buttons -->
      <div class="action-buttons">
        <button class="btn btn-info" @click="startDrawing">
          เริ่มวาดขอบเขต
        </button>
        <button class="btn btn-success" @click="finishDrawing">Finish</button>
        <button class="btn btn-danger" @click="clearDrawing">Clear</button>
      </div>

      <!-- Snap Settings -->
      <div class="snap-section">
        <div class="snap-controls">
          <div class="snap-row">
            <span>Snap to red</span>
            <span>Red ≥</span>
            <input type="number" v-model="snapSettings.red" class="number-input" />
          </div>
          <div class="snap-row">
            <span>Green ≤</span>
            <input type="number" v-model="snapSettings.green" class="number-input" />
            <span>Blue ≤</span>
            <input type="number" v-model="snapSettings.blue" class="number-input" />
          </div>
          <label class="checkbox-label">
            <input type="checkbox" v-model="snapEnabled" />
            <span class="checkmark">✓</span>
            ใช้ Snap
          </label>
        </div>
      </div>

      <!-- Form Section -->
      <div class="form-section">
        <h3>ข้อมูลแปลง (พื้นดิน)</h3>
        <div class="form-subtitle">ข้อมูลการประเมินแปลง</div>

        <div class="form-group">
          <label>ขนาดที่ดิน (ตร.วา)</label>
          <div class="form-subtitle">ระบบสามารถให้ข้อมูลอัตโนมัติ</div>
          <input type="number" v-model="landData.size" class="form-input" placeholder="0" />
        </div>

        <div class="form-group">
          <label>หน้ากว้าง (เมตร)</label>
          <div class="form-subtitle">เลือกเส้นทางกว้างหรือทรกเฉลา</div>
          <input type="number" v-model="landData.width" class="form-input" placeholder="0" />
        </div>

        <div class="form-group">
          <label>เจ้าของ</label>
          <input type="text" v-model="landData.owner" placeholder="ชื่อ-สกุล" class="form-input" />
        </div>

        <div class="form-group">
          <label>โทร</label>
          <input type="text" v-model="landData.phone" placeholder="08x-xxx-xxxx" class="form-input" />
        </div>

        <div class="form-group">
          <label>LINE ID</label>
          <input type="text" v-model="landData.lineId" placeholder="@lineid หรือ lineid" class="form-input" />
        </div>

        <div class="form-group">
          <label>ข้อมูลราคาเปิดเผย</label>
          <input type="text" v-model="landData.price" placeholder="[เจ้า] ล้าน" class="form-input" />
        </div>

        <button class="btn btn-primary btn-full" @click="saveLandData">
          บันทึกและปิด
        </button>

        <div class="section-divider"></div>

        <h3>รายการแปลง</h3>
        <div class="form-subtitle">ข้อมูลรายการแปลง</div>

        <div class="land-list" v-if="savedLands.length > 0">
          <div v-for="(land, index) in savedLands" :key="index" class="land-item">
            <div class="land-owner">{{ land.owner || "ไม่ระบุ" }}</div>
            <div class="land-details">{{ land.size }} ตร.วา</div>
          </div>
        </div>
        <div v-else class="no-data">ยังไม่มีข้อมูลแปลง</div>
      </div>
    </nav>

    <main class="main-content">
      <aside class="map-container">
        <div id="map" style="width: 100%; height: 100%"></div>

        <!-- Map Control Buttons -->
        <div class="map-controls">
          <!-- Search Button -->
          <button class="control-btn search-btn" @click="toggleSearch" title="Search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </button>

          <!-- View My Property Button -->
          <button class="control-btn property-btn" @click="viewMyProperty" title="View My Property">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-4" />
              <polyline points="9,11 12,8 15,11" />
            </svg>
          </button>

          <!-- Filters Button -->
          <button class="control-btn filter-btn" @click="toggleFilters" title="Filters">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46" />
            </svg>
          </button>

          <!-- Layers Button -->
          <button class="control-btn layers-btn" @click="toggleLayers" title="Layers">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="12,2 2,7 12,12 22,7" />
              <polyline points="2,17 12,22 22,17" />
              <polyline points="2,12 12,17 22,12" />
            </svg>
          </button>

          <!-- P2P Chat Button -->
          <button class="control-btn p2p-btn" :class="{ 'has-notification': hasNewMessage }" @click="toggleP2P"
            title="P2P Chat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span v-if="unreadCount > 0" class="notification-badge">{{
              unreadCount
              }}</span>
          </button>

          <!-- Explore Button -->
          <button class="control-btn explore-btn" @click="exploreArea" title="Explore">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="3,11 22,2 13,21 11,13" />
            </svg>
          </button>
        </div>

        <!-- Search Panel -->
        <div class="search-panel" v-show="showSearch">
          <div class="panel-header">
            <h3>ค้นหา</h3>
            <button @click="showSearch = false" class="close-btn">×</button>
          </div>
          <input type="text" v-model="searchQuery" placeholder="ค้นหาสถานที่..." class="search-input" />
          <button @click="performSearch" class="btn btn-primary">ค้นหา</button>
        </div>

        <!-- Filters Panel -->
        <div class="filters-panel" v-show="showFilters">
          <div class="panel-header">
            <h3>ตัวกรอง</h3>
            <button @click="showFilters = false" class="close-btn">×</button>
          </div>
          <div class="filter-group">
            <label>ประเภทที่ดิน</label>
            <select v-model="filters.landType" class="form-select">
              <option value="">ทั้งหมด</option>
              <option value="residential">ที่อยู่อาศัย</option>
              <option value="commercial">พาณิชยกรรม</option>
              <option value="industrial">อุตสาหกรรม</option>
            </select>
          </div>
          <div class="filter-group">
            <label>ช่วงราคา (ล้านบาท)</label>
            <div class="price-range">
              <input type="number" v-model="filters.priceMin" placeholder="ต่ำสุด" class="price-input" />
              <input type="number" v-model="filters.priceMax" placeholder="สูงสุด" class="price-input" />
            </div>
          </div>
          <button @click="applyFilters" class="btn btn-primary">
            ใช้ตัวกรอง
          </button>
        </div>

        <!-- Layers Panel -->
        <div class="layers-panel" v-show="showLayers">
          <div class="panel-header">
            <h3>เลเยอร์</h3>
            <button @click="showLayers = false" class="close-btn">×</button>
          </div>
          <div class="layer-item" v-for="layer in availableLayers" :key="layer.id">
            <label class="checkbox-label">
              <input type="checkbox" v-model="layer.visible" />
              <span class="checkmark">✓</span>
              {{ layer.name }}
            </label>
          </div>
        </div>

        <!-- P2P Chat Panel -->
        <div class="chat-popup" v-show="showChat">
          <div class="chat-header">
            <div class="chat-title">
              <h3>P2P Chat</h3>
              <div style="font-size: 12px; color: #9ca3af">
                คุณ: {{ userProfile.name || "Guest" }}
              </div>
              <div class="online-users">
                <span class="online-indicator"></span>
                {{ onlineUsers }} คนออนไลน์
              </div>
            </div>
            <button @click="showChat = false" class="close-btn">×</button>
          </div>

          <!-- User Profile Section -->
          <div class="user-profile" v-if="!userProfile.name">
            <input type="text" v-model="tempUserName" placeholder="กรุณาใส่ชื่อของคุณ" class="profile-input"
              @keyup.enter="setUserProfile" />
            <button @click="setUserProfile" class="btn btn-sm btn-primary">
              ตั้งชื่อ
            </button>
          </div>

          <div class="chat-body" ref="chatBody">
            <div v-for="msg in chatMessages" :key="msg.id" class="chat-msg" :class="{
              me: msg.uid === currentUserId,
              system: msg.type === 'system',
            }">
              <div class="bubble">
                <div class="meta" v-if="!msg.type">
                  {{ msg.name }}
                  <span class="timestamp">{{ formatTime(msg.createdAt) }}</span>
                </div>
                <div class="text">{{ msg.text }}</div>
              </div>
            </div>
            <div v-if="chatMessages.length === 0" class="no-messages">
              ยังไม่มีข้อความ เริ่มคุยกันเลย!
            </div>
          </div>

          <!-- Typing Indicator -->
          <div class="typing-indicator" v-if="showTypingIndicator">
            <span class="typing-dots">
              <span></span>
              <span></span>
              <span></span>
            </span>
            มีคนกำลังพิมพ์...
          </div>

          <div class="chat-input-row">
            <input type="text" v-model="chatInput" placeholder="พิมพ์ข้อความ..." class="chat-input"
              @keyup.enter="sendMessage" @input="handleTyping" :disabled="!userProfile.name" />
            <button @click="sendMessage" class="btn btn-sm btn-primary send-btn"
              :disabled="!chatInput.trim() || !userProfile.name">
              ส่ง
            </button>
          </div>
        </div>
      </aside>
    </main>
  </div>
</template>

<script src="./app-script.js"></script>

<style>
@import "./styles/base.css";
@import "./styles/header.css";
@import "./styles/navbar.css";
@import "./styles/forms.css";
@import "./styles/buttons.css";
@import "./styles/controls.css";
@import "./styles/sections.css";
@import "./styles/map.css";
@import "./styles/panels.css";
@import "./styles/responsive.css";
@import "./styles/chat.css";
</style>
