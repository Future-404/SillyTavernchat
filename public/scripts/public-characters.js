// 公用角色卡页面JavaScript - 沉浸式画廊版

let characters = [];
let filteredCharacters = [];
let currentCategoryFilter = 'all';
let publicCharactersCurrentPage = 0;
const itemsPerPage = 12;
let isLoading = false;
let isLoggedIn = false;
let publicCharactersCurrentUser = null;
let currentCharacterId = null;
let comments = [];

// 检查用户登录状态
async function checkLoginStatus() {
    try {
        const response = await fetch('/api/users/me', {
            method: 'GET',
            credentials: 'include',
            headers: { 'Accept': 'application/json' }
        });

        if (response.ok) {
            const userData = await response.json();
            isLoggedIn = true;
            publicCharactersCurrentUser = userData;
            return true;
        } else {
            isLoggedIn = false;
            publicCharactersCurrentUser = null;
            return false;
        }
    } catch (error) {
        console.error('Failed to check login status:', error);
        isLoggedIn = false;
        return false;
    }
}

// 根据登录状态更新界面
function updateUIForLoginStatus() {
    if (isLoggedIn) {
        // 登录用户：显示FAB上传按钮和用户信息
        $('#headerUploadButton').fadeIn();
        $('#userInfo').css('display', 'flex'); // Flex布局适配新的Header
        $('#loginPrompt').hide();

        if (publicCharactersCurrentUser) {
            $('#userName').text(publicCharactersCurrentUser.name || publicCharactersCurrentUser.handle);
        }
    } else {
        // 游客：隐藏上传按钮，显示登录提示
        $('#headerUploadButton').hide();
        $('#userInfo').hide();
        $('#loginPrompt').css('display', 'flex');
    }
}

// 显示/隐藏加载指示器
function showLoading() { isLoading = true; $('#loadingIndicator').fadeIn(); }
function hideLoading() { isLoading = false; $('#loadingIndicator').fadeOut(); }

// 消息提示 (使用简单的 Alert 或后续集成 Toast)
function showError(message) { alert(message); }
function showSuccess(message) { alert(message); }

// 格式化日期
function formatDate(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

// 加载角色卡列表
async function loadCharacters() {
    try {
        showLoading();
        const response = await fetch('/api/public-characters/', { method: 'GET', credentials: 'include' });

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                isLoggedIn = false;
                updateUIForLoginStatus();
                // 允许游客浏览，不报错，只是不能操作
                // 如果后端强制要求登录才能看列表，则取消注释下面这行
                // showError('请登录以浏览角色库'); return;
            }
        }

        const data = await response.json();
        // 确保 data 是数组
        characters = Array.isArray(data) ? data : [];
        filteredCharacters = [...characters];
        renderCharacters();
    } catch (error) {
        console.error('Failed to load characters:', error);
        // showError('加载失败');
    } finally {
        hideLoading();
    }
}

// 渲染角色卡
function renderCharacters() {
    const grid = $('#charactersGrid');
    grid.empty();
    publicCharactersCurrentPage = 0;

    const pageCharacters = filteredCharacters.slice(0, itemsPerPage);

    if (pageCharacters.length === 0) {
        grid.html(`
            <div class="no-characters">
                <i class="fa-solid fa-ghost"></i>
                <h3>这里空空如也</h3>
                <p>尝试调整搜索词，或者上传第一个角色！</p>
            </div>
        `);
        $('#loadMoreButton').hide();
        return;
    }

    pageCharacters.forEach(character => {
        grid.append(createCharacterCard(character));
    });

    updateLoadMoreButton();
}

// 追加更多角色卡
function appendMoreCharacters() {
    const grid = $('#charactersGrid');
    const startIndex = (publicCharactersCurrentPage + 1) * itemsPerPage;
    const pageCharacters = filteredCharacters.slice(startIndex, startIndex + itemsPerPage);

    if (pageCharacters.length === 0) {
        $('#loadMoreButton').hide();
        return;
    }

    pageCharacters.forEach(character => {
        grid.append(createCharacterCard(character));
    });

    publicCharactersCurrentPage++;
    updateLoadMoreButton();
}

function updateLoadMoreButton() {
    const totalLoaded = (publicCharactersCurrentPage + 1) * itemsPerPage;
    $('#loadMoreButton').toggle(totalLoaded < filteredCharacters.length);
}

// === 核心修改：创建沉浸式角色卡 ===
function createCharacterCard(character) {
    // 头像处理
    let avatarUrl;
    if (character.avatar && character.avatar.endsWith('.png')) {
        avatarUrl = `/api/public-characters/avatar/${encodeURIComponent(character.avatar)}`;
    } else {
        avatarUrl = '/img/default-expressions/neutral.png';
    }

    const uploaderName = character.uploader?.name || character.uploader || 'Unknown';
    
    // 快速导入按钮逻辑
    const importAction = isLoggedIn 
        ? `importCharacter('${character.id}')` 
        : `showError('请先登录')`;
    
    const importIconClass = isLoggedIn ? 'fa-cloud-arrow-down' : 'fa-lock';

    // 返回 HTML 字符串
    // 注意：onclick="viewCharacter" 绑定整个卡片点击
    // 快速按钮使用 event.stopPropagation() 防止触发卡片点击
    return `
        <div class="character-card-item" onclick="viewCharacter('${character.id}')">
            <img src="${avatarUrl}" alt="${character.name}" loading="lazy" onerror="this.src='/img/default-expressions/neutral.png'">
            
            <div class="card-overlay">
                <h3 class="card-title">${character.name}</h3>
                <div class="card-meta">
                    <span class="uploader"><i class="fa-solid fa-user-pen"></i> ${uploaderName}</span>
                </div>
            </div>

            <button class="quick-action-btn" onclick="event.stopPropagation(); ${importAction}" title="快速导入">
                <i class="fa-solid ${importIconClass}"></i>
            </button>
        </div>
    `;
}

// 搜索和筛选
function filterCharacters() {
    const searchTerm = String($('#searchInput').val() || '').toLowerCase();
    const sortBy = String($('#sortSelect').val() || '');

    filteredCharacters = characters.filter(character => {
        // 1. 基础搜索匹配
        const nameMatch = character.name.toLowerCase().includes(searchTerm);
        const uploaderMatch = String(character.uploader?.name || character.uploader || '').toLowerCase().includes(searchTerm);
        const tags = character.tags || [];
        const tagsMatch = tags.some(tag => tag.toLowerCase().includes(searchTerm));
        const basicMatch = nameMatch || uploaderMatch || tagsMatch;

        // 2. 分类匹配 (Category Filter)
        let categoryMatch = true;
        if (currentCategoryFilter === 'male_oriented') {
            categoryMatch = tags.includes('男性向');
        } else if (currentCategoryFilter === 'female_oriented') {
            categoryMatch = tags.includes('女性向');
        }
        
        return basicMatch && categoryMatch;
    });

    // 排序逻辑
    filteredCharacters.sort((a, b) => {
        switch (sortBy) {
            case 'name': return a.name.localeCompare(b.name);
            case 'uploader': 
                const uA = a.uploader?.name || a.uploader || '';
                const uB = b.uploader?.name || b.uploader || '';
                return uA.localeCompare(uB);
            case 'date':
            default:
                // 优先使用 uploaded_at，兼容旧数据 date_added
                const dateA = new Date(a.uploaded_at || a.date_added || 0).getTime();
                const dateB = new Date(b.uploaded_at || b.date_added || 0).getTime();
                return dateB - dateA;
        }
    });

    renderCharacters();
}

// 导入角色卡
async function importCharacter(characterId) {
    if (!isLoggedIn) { showError('请先登录'); return; }

    try {
        const response = await fetch(`/api/public-characters/${characterId}/import`, {
            method: 'POST',
            credentials: 'include'
        });
        
        if (!response.ok) throw new Error('导入失败');
        
        showSuccess('已导入到您的角色库！');
    } catch (error) {
        console.error(error);
        showError('导入失败，请重试');
    }
}

// 查看详情 (打开模态框)
async function viewCharacter(characterId) {
    try {
        showLoading();
        const response = await fetch(`/api/public-characters/${characterId}`, { method: 'GET', credentials: 'include' });
        if (!response.ok) throw new Error('获取详情失败');
        
        const character = await response.json();
        showCharacterModal(character);
    } catch (error) {
        console.error(error);
    } finally {
        hideLoading();
    }
}

// 显示详情模态框
function showCharacterModal(character) {
    currentCharacterId = character.id;
    
    // 数据填充
    let avatarUrl = (character.avatar && character.avatar.endsWith('.png')) 
        ? `/api/public-characters/avatar/${encodeURIComponent(character.avatar)}`
        : '/img/default-expressions/neutral.png';

    $('#characterModalTitle').text(character.name);
    $('#characterModalAvatar').attr('src', avatarUrl);
    $('#characterModalName').text(character.name);
    $('#characterModalDescription').text(character.description || '暂无描述');
    $('#characterModalUploader').text(character.uploader?.name || character.uploader || 'Unknown');
    $('#characterModalDate').text(formatDate(character.uploaded_at || character.date_added));

    // 标签渲染
    const tagsHtml = (character.tags || []).map(tag => `<span class="tag-pill">${tag}</span>`).join('');
    $('#characterModalTags').html(tagsHtml);

    // 导入按钮状态
    const btn = $('#importCharacterButton');
    btn.off('click'); // 移除旧绑定
    
    if (isLoggedIn) {
        btn.prop('disabled', false).html('<i class="fa-solid fa-cloud-arrow-down"></i> 导入到库');
        btn.on('click', () => { importCharacter(character.id); $('#characterModal').fadeOut(); });
    } else {
        btn.prop('disabled', true).html('<i class="fa-solid fa-lock"></i> 登录后导入');
    }
    
    // 查看卡片原始文件 (暂定功能)
    $('#viewCharacterButton').off('click').on('click', () => {
        // 这里可以扩展为查看JSON原始内容
        alert('功能开发中...');
    });

    // 加载评论
    updateCommentsSection();
    loadComments(character.id);

    // 显示模态框 (使用 flex 以配合 CSS 居中)
    $('#characterModal').css('display', 'flex').hide().fadeIn(200);
}

// 上传角色卡
async function uploadCharacter(formData) {
    try {
        showLoading();
        const response = await fetch('/api/public-characters/upload', {
            method: 'POST', body: formData, credentials: 'include'
        });

        if (!response.ok) throw new Error('上传失败');
        
        const data = await response.json();
        showSuccess(`"${data.name}" 上传成功！`);
        
        // 刷新列表并关闭模态框
        loadCharacters(); 
        $('#uploadModal').fadeOut();
        $('#uploadForm')[0].reset();
    } catch (error) {
        showError(error.message || '上传出错');
    } finally {
        hideLoading();
    }
}

// 加载更多点击
function loadMore() {
    const btn = $('#loadMoreButton');
    btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> 加载中...');
    setTimeout(() => {
        appendMoreCharacters();
        btn.prop('disabled', false).html('加载更多...');
    }, 500);
}

// === 初始化 ===
$(document).ready(async function() {
    // 基础初始化
    await checkLoginStatus();
    updateUIForLoginStatus();
    await loadCharacters();

    // 绑定事件
    $('#searchInput').on('input', filterCharacters);
    
    // 分类切换点击事件
    $('.cat-btn').on('click', function() {
        $('.cat-btn').removeClass('active');
        $(this).addClass('active');
        
        currentCategoryFilter = $(this).data('category');
        filterCharacters();
    });

    $('#sortSelect').on('change', filterCharacters);
    $('#loadMoreButton').on('click', loadMore);

    // 上传流程
    $('#headerUploadButton').on('click', () => isLoggedIn ? $('#uploadModal').css('display', 'flex').hide().fadeIn(200) : showError('请先登录'));
    
    // 模态框关闭逻辑
    $('.modal-close, #cancelUpload').on('click', function() {
        $(this).closest('.modal').fadeOut(200);
    });
    
    // 点击模态框背景关闭
    $('.modal').on('click', function(e) {
        if (e.target === this) $(this).fadeOut(200);
    });

    // 表单提交
    $('#uploadForm').on('submit', async function(e) {
        e.preventDefault();
        if (!isLoggedIn) {
            showError('会话已过期，请重新登录');
            return;
        }

        const fileInput = $('#characterFile')[0];
        if (!fileInput || !fileInput.files || !fileInput.files[0]) { 
            showError('请选择角色卡文件'); 
            console.error('File input not found or empty');
            return; 
        }

        const file = fileInput.files[0];
        const fileName = file.name.toLowerCase();
        if (!fileName.endsWith('.png') && !fileName.endsWith('.json') && !fileName.endsWith('.yaml') && !fileName.endsWith('.yml')) {
            showError('不支持的文件格式。仅支持 PNG, JSON, YAML。');
            return;
        }

        const formData = new FormData();
        formData.append('avatar', file);
        formData.append('file_type', fileInput.files[0].name.split('.').pop().toLowerCase());
        
        const name = $('#characterName').val();
        if (name) formData.append('name', name);
        
        const desc = $('#characterDescription').val();
        if (desc) formData.append('description', desc);
        
        const tags = $('#characterTags').val();
        let tagArray = [];
        if (tags) {
            tagArray = tags.split(/[,，]/).map(t => t.trim()).filter(t => t);
        }

        // 获取选中的分类并强制添加到标签
        const targetAudience = $('input[name="target_audience"]:checked').val();
        if (targetAudience && !tagArray.includes(targetAudience)) {
            tagArray.unshift(targetAudience);
        }

        if (tagArray.length > 0) {
            formData.append('tags', JSON.stringify(tagArray));
        }

        await uploadCharacter(formData);
    });

    // 文件名自动填充与按钮状态更新
    $('#characterFile').on('change', function() {
        if (this.files[0]) {
            const fileName = this.files[0].name;
            $('#characterName').val(fileName.replace(/\.[^/.]+$/, ""));
            $('#fileNameDisplay').text('已选择: ' + fileName).css('color', '#fff');
            $('.file-upload-btn').css({
                'border-style': 'solid',
                'background': 'rgba(164, 189, 252, 0.2)',
                'border-color': '#4CAF50'
            });
        } else {
            $('#fileNameDisplay').text('点击选择角色卡 (PNG, JSON, YAML)').css('color', '');
            $('.file-upload-btn').css({
                'border-style': 'dashed',
                'background': '',
                'border-color': ''
            });
        }
    });

    // 评论提交
    $('#submitCommentButton').on('click', submitComment);
    $('#commentInput').on('keydown', e => { if (e.ctrlKey && e.keyCode === 13) submitComment(); });
});


// === 评论功能模块 ===
async function loadComments(characterId) {
    try {
        const response = await fetch(`/api/public-characters/${characterId}/comments`, { method: 'GET', credentials: 'include' });
        if (response.ok) {
            comments = await response.json();
            renderComments();
            $('#commentsCount').text(countTotalComments(comments));
        }
    } catch (e) { console.error(e); }
}

function renderComments() {
    const list = $('#commentsList');
    list.empty();
    if (comments.length === 0) {
        list.html('<div style="text-align:center; padding:20px; color:rgba(255,255,255,0.3);">暂无评论</div>');
        return;
    }
    comments.forEach(c => list.append(createCommentElement(c)));
}

function createCommentElement(comment, depth = 0) {
    const isAuthor = isLoggedIn && publicCharactersCurrentUser && comment.author.handle === publicCharactersCurrentUser.handle;
    
    // 构建回复HTML
    let repliesHtml = '';
    if (comment.replies && comment.replies.length) {
        repliesHtml = '<div class="replies" style="margin-left: 20px; border-left: 2px solid rgba(255,255,255,0.1); padding-left: 10px;">';
        comment.replies.forEach(r => repliesHtml += createCommentElement(r, depth + 1));
        repliesHtml += '</div>';
    }

    return `
        <div class="comment-item" style="margin-bottom: 15px;">
            <div style="display:flex; justify-content:space-between; font-size:0.85rem; color:var(--primary-color); margin-bottom:5px;">
                <span>${comment.author.name || comment.author.handle}</span>
                <span style="color:rgba(255,255,255,0.4);">${formatDate(comment.created_at)}</span>
            </div>
            <div style="color:#eee; font-size:0.95rem; line-height:1.4;">${escapeHtml(comment.content)}</div>
            
            <div class="comment-actions" style="margin-top:5px; font-size:0.8rem;">
                ${isLoggedIn ? `<a href="#" onclick="showReplyInput('${comment.id}'); return false;" style="color:rgba(255,255,255,0.5); margin-right:10px;">回复</a>` : ''}
                ${(isAuthor || (publicCharactersCurrentUser?.admin)) ? `<a href="#" onclick="deleteComment('${comment.id}'); return false;" style="color:#ff6b6b;">删除</a>` : ''}
            </div>

            <div id="replyInput_${comment.id}" style="display:none; margin-top:10px;">
                <textarea class="form-textarea" rows="1" placeholder="回复..."></textarea>
                <div style="margin-top:5px; text-align:right;">
                    <button class="btn btn-primary btn-small" onclick="submitReply('${comment.id}')" style="padding:4px 10px; font-size:0.8rem;">发送</button>
                    <button class="btn btn-secondary btn-small" onclick="$('#replyInput_${comment.id}').hide()" style="padding:4px 10px; font-size:0.8rem;">取消</button>
                </div>
            </div>
            
            ${repliesHtml}
        </div>
    `;
}

// 辅助函数
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/\n/g, '<br>');
}

function countTotalComments(list) {
    let count = list.length;
    list.forEach(c => { if(c.replies) count += countTotalComments(c.replies); });
    return count;
}

// 评论操作函数 (发表、回复、删除)
async function submitComment() {
    if (!isLoggedIn) return showError('请登录');
    const content = $('#commentInput').val().trim();
    if (!content) return;
    
    await postCommentData({ content });
    $('#commentInput').val('');
}

async function submitReply(parentId) {
    const content = $(`#replyInput_${parentId} textarea`).val().trim();
    if (!content) return;
    
    await postCommentData({ content, parentId });
    $(`#replyInput_${parentId}`).hide();
}

async function postCommentData(payload) {
    try {
        const res = await fetch(`/api/public-characters/${currentCharacterId}/comments`, {
            method: 'POST', credentials: 'include',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        if (res.ok) loadComments(currentCharacterId);
        else showError('发表失败');
    } catch(e) { console.error(e); }
}

async function deleteComment(commentId) {
    if (!confirm('确认删除？')) return;
    try {
        const res = await fetch(`/api/public-characters/${currentCharacterId}/comments/${commentId}`, { method: 'DELETE', credentials: 'include' });
        if (res.ok) loadComments(currentCharacterId);
    } catch(e) { console.error(e); }
}

function updateCommentsSection() {
    if (isLoggedIn) {
        $('#commentInputSection').show();
        $('#commentLoginPrompt').hide();
    } else {
        $('#commentInputSection').hide();
        $('#commentLoginPrompt').show();
    }
}

// === CSS 注入 (用于修饰 JS 生成的动态元素) ===
$('<style>').text(`
    /* 卡片内部样式 */
    .character-card-item {
        /* 此类名需与 JS 中的 createCharacterCard 对应 */
        background: rgba(30, 30, 35, 0.4);
        border-radius: 16px;
        overflow: hidden;
        position: relative;
        aspect-ratio: 2 / 3;
        cursor: pointer;
        border: 1px solid rgba(255, 255, 255, 0.05);
        transition: transform 0.2s, box-shadow 0.2s;
    }
    
    .character-card-item:hover {
        transform: translateY(-5px);
        box-shadow: 0 10px 25px rgba(0,0,0,0.3);
        border-color: rgba(164, 189, 252, 0.3);
    }
    
    /* 图片全铺 */
    .character-card-item img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.5s;
    }
    
    .character-card-item:hover img {
        transform: scale(1.05);
    }
    
    /* 底部遮罩 */
    .card-overlay {
        position: absolute;
        bottom: 0;
        left: 0;
        width: 100%;
        padding: 40px 15px 15px 15px;
        background: linear-gradient(to top, rgba(0,0,0,0.95), rgba(0,0,0,0.6) 50%, transparent);
        color: white;
        pointer-events: none;
        box-sizing: border-box;
    }
    
    .card-title {
        margin: 0 0 5px 0;
        font-size: 1.1rem;
        font-weight: 700;
        text-shadow: 0 2px 4px rgba(0,0,0,0.8);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    
    .card-meta {
        font-size: 0.8rem;
        color: rgba(255,255,255,0.8);
        display: flex;
        align-items: center;
        gap: 5px;
    }

    /* 快速导入按钮 */
    .quick-action-btn {
        position: absolute;
        top: 10px;
        right: 10px;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: rgba(0,0,0,0.5);
        backdrop-filter: blur(5px);
        border: 1px solid rgba(255,255,255,0.2);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        opacity: 0;
        transform: translateY(-10px);
        transition: all 0.2s;
        z-index: 2;
    }

    .quick-action-btn:hover {
        background: var(--primary-color);
        border-color: transparent;
    }
    
    /* 移动端始终显示快速按钮，PC端悬停显示 */
    @media (hover: hover) {
        .character-card-item:hover .quick-action-btn {
            opacity: 1;
            transform: translateY(0);
        }
    }
    @media (hover: none) {
        .quick-action-btn {
            opacity: 1;
            transform: translateY(0);
            background: rgba(0,0,0,0.3);
        }
    }

    /* 空状态样式 */
    .no-characters {
        grid-column: 1 / -1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 50px;
        color: rgba(255,255,255,0.5);
    }
    .no-characters i { font-size: 3rem; margin-bottom: 20px; }
`).appendTo('head');
