// データ管理
class BookmarkManager {
    constructor() {
        this.categories = this.loadData() || this.getDefaultData();
        this.currentCategoryId = null;
        this.currentBookmarkId = null;
        this.editMode = false;
    }

    getDefaultData() {
        return [
            {
                id: this.generateId(),
                name: '趣味',
                color: '#4CAF50',
                bookmarks: [
                    { id: this.generateId(), name: 'YouTube', url: 'https://www.youtube.com', description: '動画共有サイト' },
                    { id: this.generateId(), name: 'Netflix', url: 'https://www.netflix.com', description: '動画ストリーミング' }
                ]
            },
            {
                id: this.generateId(),
                name: 'プライベート',
                color: '#2196F3',
                bookmarks: [
                    { id: this.generateId(), name: 'Gmail', url: 'https://mail.google.com', description: 'メール' },
                    { id: this.generateId(), name: 'カレンダー', url: 'https://calendar.google.com', description: 'スケジュール管理' }
                ]
            },
            {
                id: this.generateId(),
                name: '仕事',
                color: '#FF5722',
                bookmarks: [
                    { id: this.generateId(), name: 'Slack', url: 'https://slack.com', description: 'チームコミュニケーション' },
                    { id: this.generateId(), name: 'Zoom', url: 'https://zoom.us', description: 'ビデオ会議' }
                ]
            },
            {
                id: this.generateId(),
                name: '勉強',
                color: '#9C27B0',
                bookmarks: [
                    { id: this.generateId(), name: 'Google', url: 'https://www.google.com', description: '検索エンジン' },
                    { id: this.generateId(), name: 'Wikipedia', url: 'https://ja.wikipedia.org', description: 'オンライン百科事典' }
                ]
            }
        ];
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    loadData() {
        try {
            const data = localStorage.getItem('bookmarkData');
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('データの読み込みに失敗しました:', error);
            return null;
        }
    }

    saveData() {
        try {
            localStorage.setItem('bookmarkData', JSON.stringify(this.categories));
        } catch (error) {
            console.error('データの保存に失敗しました:', error);
            alert('データの保存に失敗しました。ストレージの容量を確認してください。');
        }
    }

    addCategory(name, color) {
        const category = {
            id: this.generateId(),
            name: name,
            color: color,
            bookmarks: []
        };
        this.categories.push(category);
        this.saveData();
        return category;
    }

    updateCategory(categoryId, name, color) {
        const category = this.categories.find(c => c.id === categoryId);
        if (category) {
            category.name = name;
            category.color = color;
            this.saveData();
            return true;
        }
        return false;
    }

    deleteCategory(categoryId) {
        const index = this.categories.findIndex(c => c.id === categoryId);
        if (index !== -1) {
            this.categories.splice(index, 1);
            this.saveData();
            return true;
        }
        return false;
    }

    addBookmark(categoryId, name, url, description) {
        const category = this.categories.find(c => c.id === categoryId);
        if (category) {
            // URLの正規化
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                url = 'https://' + url;
            }
            
            const bookmark = {
                id: this.generateId(),
                name: name,
                url: url,
                description: description || ''
            };
            category.bookmarks.push(bookmark);
            this.saveData();
            return bookmark;
        }
        return null;
    }

    updateBookmark(categoryId, bookmarkId, name, url, description) {
        const category = this.categories.find(c => c.id === categoryId);
        if (category) {
            const bookmark = category.bookmarks.find(b => b.id === bookmarkId);
            if (bookmark) {
                // URLの正規化
                if (!url.startsWith('http://') && !url.startsWith('https://')) {
                    url = 'https://' + url;
                }
                
                bookmark.name = name;
                bookmark.url = url;
                bookmark.description = description || '';
                this.saveData();
                return true;
            }
        }
        return false;
    }

    deleteBookmark(categoryId, bookmarkId) {
        const category = this.categories.find(c => c.id === categoryId);
        if (category) {
            const index = category.bookmarks.findIndex(b => b.id === bookmarkId);
            if (index !== -1) {
                category.bookmarks.splice(index, 1);
                this.saveData();
                return true;
            }
        }
        return false;
    }

    searchBookmarks(query) {
        if (!query.trim()) return this.categories;

        const lowerQuery = query.toLowerCase();
        return this.categories.map(category => ({
            ...category,
            bookmarks: category.bookmarks.filter(bookmark =>
                bookmark.name.toLowerCase().includes(lowerQuery) ||
                bookmark.url.toLowerCase().includes(lowerQuery) ||
                (bookmark.description && bookmark.description.toLowerCase().includes(lowerQuery))
            )
        })).filter(category => category.bookmarks.length > 0);
    }

    exportData() {
        const dataStr = JSON.stringify(this.categories, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `bookmarks_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        URL.revokeObjectURL(url);
    }

    importData(jsonData) {
        try {
            const data = JSON.parse(jsonData);
            if (Array.isArray(data) && data.every(cat => cat.name && cat.bookmarks)) {
                this.categories = data;
                this.saveData();
                return true;
            }
            return false;
        } catch (error) {
            console.error('インポートエラー:', error);
            return false;
        }
    }

    getStats() {
        const categoryCount = this.categories.length;
        const bookmarkCount = this.categories.reduce((sum, cat) => sum + cat.bookmarks.length, 0);
        return { categoryCount, bookmarkCount };
    }
}

// UI管理
class UIManager {
    constructor(bookmarkManager) {
        this.manager = bookmarkManager;
        this.initElements();
        this.initEventListeners();
        this.render();
    }

    initElements() {
        // モーダル要素
        this.categoryModal = document.getElementById('categoryModal');
        this.bookmarkModal = document.getElementById('bookmarkModal');
        this.importModal = document.getElementById('importModal');

        // ボタン
        this.addCategoryBtn = document.getElementById('addCategoryBtn');
        this.exportBtn = document.getElementById('exportBtn');
        this.importBtn = document.getElementById('importBtn');

        // 入力フィールド
        this.searchInput = document.getElementById('searchInput');

        // メインコンテンツ
        this.mainContent = document.getElementById('mainContent');

        // 統計
        this.categoryCountEl = document.getElementById('categoryCount');
        this.bookmarkCountEl = document.getElementById('bookmarkCount');
    }

    initEventListeners() {
        // カテゴリー追加ボタン
        this.addCategoryBtn.addEventListener('click', () => this.openCategoryModal());

        // エクスポート
        this.exportBtn.addEventListener('click', () => {
            this.manager.exportData();
            this.showNotification('データをエクスポートしました！', 'success');
        });

        // インポート
        this.importBtn.addEventListener('click', () => this.openImportModal());

        // 検索
        this.searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));

        // モーダルのクローズボタン
        document.querySelectorAll('.modal .close').forEach(closeBtn => {
            closeBtn.addEventListener('click', () => this.closeAllModals());
        });

        // モーダル外クリックで閉じる
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.closeAllModals();
            }
        });

        // カテゴリーモーダルのボタン
        document.getElementById('saveCategoryBtn').addEventListener('click', () => this.saveCategory());
        document.getElementById('cancelCategoryBtn').addEventListener('click', () => this.closeAllModals());

        // ブックマークモーダルのボタン
        document.getElementById('saveBookmarkBtn').addEventListener('click', () => this.saveBookmark());
        document.getElementById('cancelBookmarkBtn').addEventListener('click', () => this.closeAllModals());

        // インポートモーダルのボタン
        document.getElementById('confirmImportBtn').addEventListener('click', () => this.handleImport());
        document.getElementById('cancelImportBtn').addEventListener('click', () => this.closeAllModals());
    }

    render(categories = this.manager.categories) {
        this.mainContent.innerHTML = '';

        if (categories.length === 0) {
            this.mainContent.innerHTML = `
                <div class="empty-state">
                    <h2>📭 カテゴリーがありません</h2>
                    <p>「カテゴリー追加」ボタンからカテゴリーを作成してください</p>
                </div>
            `;
        } else {
            categories.forEach((category, index) => {
                const categoryCard = this.createCategoryCard(category, index);
                this.mainContent.appendChild(categoryCard);
            });
        }

        this.updateStats();
    }

    createCategoryCard(category, index) {
        const card = document.createElement('div');
        card.className = 'category-card';
        card.draggable = true;
        card.ondragstart = (e) => this.handleCategoryDragStart(e, index);
        card.ondragover = (e) => this.handleCategoryDragOver(e);
        card.ondrop = (e) => this.handleCategoryDrop(e, index);
        card.ondragend = (e) => this.handleDragEnd(e);
        card.innerHTML = `
            <div class="category-header" style="background: ${category.color};">
                <div class="category-title" style="cursor: move;">
                    <span>⋮⋮</span>
                    <span>📂</span>
                    <span>${this.escapeHtml(category.name)}</span>
                </div>
                <div class="category-actions">
                    <button class="icon-btn" onclick="event.stopPropagation(); ui.openCategoryModal('${category.id}')" title="編集">✏️</button>
                    <button class="icon-btn" onclick="event.stopPropagation(); ui.deleteCategory('${category.id}')" title="削除">🗑️</button>
                </div>
            </div>
            <div class="category-body">
                <div class="bookmark-list" id="bookmarks-${category.id}">
                    ${this.renderBookmarks(category)}
                </div>
                <button class="add-bookmark-btn" onclick="ui.openBookmarkModal('${category.id}')">
                    ➕ ブックマークを追加
                </button>
            </div>
        `;
        return card;
    }

    renderBookmarks(category) {
        if (category.bookmarks.length === 0) {
            return '<div class="empty-state">ブックマークがありません</div>';
        }

        return category.bookmarks.map((bookmark, index) => `
            <div class="bookmark-item" onclick="ui.openBookmark('${this.escapeHtml(bookmark.url)}')" draggable="true" ondragstart="ui.handleBookmarkDragStart(event, '${category.id}', ${index})" ondragover="ui.handleBookmarkDragOver(event)" ondrop="ui.handleBookmarkDrop(event, '${category.id}', ${index})" ondragend="ui.handleDragEnd(event)">
                <div class="bookmark-info">
                    <div class="bookmark-name">⋮⋮ ${this.escapeHtml(bookmark.name)}</div>
                    <div class="bookmark-url">${this.escapeHtml(bookmark.url)}</div>
                    ${bookmark.description ? `<div class="bookmark-desc">${this.escapeHtml(bookmark.description)}</div>` : ''}
                </div>
                <div class="bookmark-actions">
                    <button class="bookmark-item-btn" onclick="event.stopPropagation(); ui.copyUrl('${this.escapeHtml(bookmark.url)}')" title="URLをコピー">📋</button>
                    <button class="bookmark-item-btn" onclick="event.stopPropagation(); ui.openBookmarkModal('${category.id}', '${bookmark.id}')" title="編集">✏️</button>
                    <button class="bookmark-item-btn" onclick="event.stopPropagation(); ui.deleteBookmark('${category.id}', '${bookmark.id}')" title="削除">🗑️</button>
                </div>
            </div>
        `).join('');
    }

    openBookmark(url) {
        try {
            window.open(url, '_blank', 'noopener,noreferrer');
        } catch (error) {
            console.error('ブックマークを開けませんでした:', error);
            this.showNotification('ブックマークを開けませんでした', 'error');
        }
    }

    openCategoryModal(categoryId = null) {
        this.manager.currentCategoryId = categoryId;
        this.manager.editMode = !!categoryId;

        const modal = this.categoryModal;
        const title = document.getElementById('categoryModalTitle');
        const nameInput = document.getElementById('categoryNameInput');
        const colorInput = document.getElementById('categoryColorInput');

        if (categoryId) {
            const category = this.manager.categories.find(c => c.id === categoryId);
            if (category) {
                title.textContent = 'カテゴリーを編集';
                nameInput.value = category.name;
                colorInput.value = category.color;
            }
        } else {
            title.textContent = 'カテゴリーを追加';
            nameInput.value = '';
            colorInput.value = '#4CAF50';
        }

        modal.style.display = 'block';
        nameInput.focus();
    }

    saveCategory() {
        const name = document.getElementById('categoryNameInput').value.trim();
        const color = document.getElementById('categoryColorInput').value;

        if (!name) {
            this.showNotification('カテゴリー名を入力してください', 'error');
            return;
        }

        if (this.manager.editMode && this.manager.currentCategoryId) {
            this.manager.updateCategory(this.manager.currentCategoryId, name, color);
            this.showNotification('カテゴリーを更新しました', 'success');
        } else {
            this.manager.addCategory(name, color);
            this.showNotification('カテゴリーを追加しました', 'success');
        }

        this.closeAllModals();
        this.render();
    }

    deleteCategory(categoryId) {
        const category = this.manager.categories.find(c => c.id === categoryId);
        if (!category) return;

        if (confirm(`「${category.name}」カテゴリーとその中のブックマークをすべて削除しますか？`)) {
            this.manager.deleteCategory(categoryId);
            this.showNotification('カテゴリーを削除しました', 'success');
            this.render();
        }
    }

    openBookmarkModal(categoryId, bookmarkId = null) {
        this.manager.currentCategoryId = categoryId;
        this.manager.currentBookmarkId = bookmarkId;
        this.manager.editMode = !!bookmarkId;

        const modal = this.bookmarkModal;
        const title = document.getElementById('bookmarkModalTitle');
        const nameInput = document.getElementById('bookmarkNameInput');
        const urlInput = document.getElementById('bookmarkUrlInput');
        const descInput = document.getElementById('bookmarkDescInput');

        if (bookmarkId) {
            const category = this.manager.categories.find(c => c.id === categoryId);
            const bookmark = category?.bookmarks.find(b => b.id === bookmarkId);
            if (bookmark) {
                title.textContent = 'ブックマークを編集';
                nameInput.value = bookmark.name;
                urlInput.value = bookmark.url;
                descInput.value = bookmark.description || '';
            }
        } else {
            title.textContent = 'ブックマークを追加';
            nameInput.value = '';
            urlInput.value = '';
            descInput.value = '';
        }

        modal.style.display = 'block';
        nameInput.focus();
    }

    saveBookmark() {
        const name = document.getElementById('bookmarkNameInput').value.trim();
        const url = document.getElementById('bookmarkUrlInput').value.trim();
        const description = document.getElementById('bookmarkDescInput').value.trim();

        if (!name) {
            this.showNotification('サイト名を入力してください', 'error');
            return;
        }

        if (!url) {
            this.showNotification('URLを入力してください', 'error');
            return;
        }

        // URL検証
        try {
            let testUrl = url;
            if (!testUrl.startsWith('http://') && !testUrl.startsWith('https://')) {
                testUrl = 'https://' + testUrl;
            }
            new URL(testUrl);
        } catch (error) {
            this.showNotification('有効なURLを入力してください', 'error');
            return;
        }

        if (this.manager.editMode && this.manager.currentBookmarkId) {
            this.manager.updateBookmark(
                this.manager.currentCategoryId,
                this.manager.currentBookmarkId,
                name,
                url,
                description
            );
            this.showNotification('ブックマークを更新しました', 'success');
        } else {
            this.manager.addBookmark(
                this.manager.currentCategoryId,
                name,
                url,
                description
            );
            this.showNotification('ブックマークを追加しました', 'success');
        }

        this.closeAllModals();
        this.render();
    }

    deleteBookmark(categoryId, bookmarkId) {
        const category = this.manager.categories.find(c => c.id === categoryId);
        const bookmark = category?.bookmarks.find(b => b.id === bookmarkId);
        
        if (!bookmark) return;

        if (confirm(`「${bookmark.name}」を削除しますか？`)) {
            this.manager.deleteBookmark(categoryId, bookmarkId);
            this.showNotification('ブックマークを削除しました', 'success');
            this.render();
        }
    }

    handleSearch(query) {
        const results = this.manager.searchBookmarks(query);
        this.render(results);
    }

    openImportModal() {
        this.importModal.style.display = 'block';
        document.getElementById('importFileInput').value = '';
    }

    handleImport() {
        const fileInput = document.getElementById('importFileInput');
        const file = fileInput.files[0];

        if (!file) {
            this.showNotification('ファイルを選択してください', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const success = this.manager.importData(e.target.result);
            if (success) {
                this.showNotification('データをインポートしました', 'success');
                this.closeAllModals();
                this.render();
            } else {
                this.showNotification('無効なファイル形式です', 'error');
            }
        };
        reader.readAsText(file);
    }

    closeAllModals() {
        this.categoryModal.style.display = 'none';
        this.bookmarkModal.style.display = 'none';
        this.importModal.style.display = 'none';
    }

    updateStats() {
        const stats = this.manager.getStats();
        this.categoryCountEl.textContent = stats.categoryCount;
        this.bookmarkCountEl.textContent = stats.bookmarkCount;
    }

    showNotification(message, type = 'info') {
        // 既存の通知を削除
        const existing = document.querySelector('.notification');
        if (existing) {
            existing.remove();
        }

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 25px;
            background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
            color: white;
            border-radius: 10px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            animation: slideIn 0.3s ease;
            font-weight: 600;
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // URLコピー機能
    copyUrl(url) {
        navigator.clipboard.writeText(url).then(() => {
            this.showNotification('URLをコピーしました！', 'success');
        }).catch(() => {
            // フォールバック方法
            const textarea = document.createElement('textarea');
            textarea.value = url;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                this.showNotification('URLをコピーしました！', 'success');
            } catch (err) {
                this.showNotification('コピーに失敗しました', 'error');
            }
            document.body.removeChild(textarea);
        });
    }

    // カテゴリーのドラッグ&ドロップ
    handleCategoryDragStart(e, index) {
        e.stopPropagation();
        this.draggedCategoryIndex = index;
        e.target.style.opacity = '0.5';
        e.dataTransfer.effectAllowed = 'move';
    }

    handleCategoryDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        return false;
    }

    handleCategoryDrop(e, targetIndex) {
        e.preventDefault();
        e.stopPropagation();
        
        if (this.draggedCategoryIndex !== undefined && this.draggedCategoryIndex !== targetIndex) {
            const categories = this.manager.categories;
            const draggedCategory = categories[this.draggedCategoryIndex];
            categories.splice(this.draggedCategoryIndex, 1);
            categories.splice(targetIndex, 0, draggedCategory);
            this.manager.saveData();
            this.render();
            this.showNotification('カテゴリーを移動しました', 'success');
        }
        return false;
    }

    // ブックマークのドラッグ&ドロップ
    handleBookmarkDragStart(e, categoryId, index) {
        e.stopPropagation();
        this.draggedBookmark = { categoryId, index };
        e.target.style.opacity = '0.5';
        e.dataTransfer.effectAllowed = 'move';
    }

    handleBookmarkDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        return false;
    }

    handleBookmarkDrop(e, categoryId, targetIndex) {
        e.preventDefault();
        e.stopPropagation();
        
        if (this.draggedBookmark && this.draggedBookmark.categoryId === categoryId) {
            const sourceIndex = this.draggedBookmark.index;
            if (sourceIndex !== targetIndex) {
                const category = this.manager.categories.find(c => c.id === categoryId);
                if (category) {
                    const bookmark = category.bookmarks[sourceIndex];
                    category.bookmarks.splice(sourceIndex, 1);
                    category.bookmarks.splice(targetIndex, 0, bookmark);
                    this.manager.saveData();
                    this.render();
                    this.showNotification('ブックマークを移動しました', 'success');
                }
            }
        }
        return false;
    }

    handleDragEnd(e) {
        e.target.style.opacity = '1';
        this.draggedCategoryIndex = undefined;
        this.draggedBookmark = undefined;
    }
}

// アニメーション用CSS追加
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// アプリケーション初期化
const bookmarkManager = new BookmarkManager();
const ui = new UIManager(bookmarkManager);

// グローバルからアクセス可能に
window.ui = ui;