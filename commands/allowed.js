const db = require('../lib/database');

module.exports = {
    name: 'allowed',
    aliases: ['allow', 'allowednumbers', 'allowedchats'],
    cooldown: 5000,
    description: 'Manage allowed numbers and chats',
    
    async run(sock, m, args, reply, chat) {
        const { isGroup, sender, body } = m;
        const senderNumber = sender.split('@')[0];
        
        // Initialize database
        await db.init();
        
        const subCommand = args[0]?.toLowerCase();
        
        // ─── HELP ──────────────────────────────────────────────────────────────
        if (!subCommand || subCommand === 'help') {
            let helpText = `*━━ ALLOWED MANAGER ━━*\n\n`;
            helpText += `*Available Commands:*\n`;
            helpText += `  • /allowed numbers - View allowed numbers\n`;
            helpText += `  • /allowed add <number> - Add allowed number\n`;
            helpText += `  • /allowed remove <number> - Remove allowed number\n\n`;
            helpText += `  • /allowed chats - View all chats\n`;
            helpText += `  • /allowed groups - View group chats only\n`;
            helpText += `  • /allowed refresh - Load all chats from store\n\n`;
            helpText += `  • /allowed settings - View settings\n`;
            helpText += `  • /allowed settings <key> <value> - Update setting\n\n`;
            helpText += `_Use buttons below to manage_`;
            
            await reply(helpText, {
                interactiveButtons: [
                    {
                        name: 'single_select',
                        buttonParamsJson: JSON.stringify({
                            title: 'Select Action',
                            sections: [{
                                title: 'Numbers Management',
                                rows: [
                                    { id: 'allowed numbers', title: 'View Numbers', description: 'See all allowed numbers' },
                                    { id: 'allowed add', title: 'Add Number', description: 'Add new allowed number' },
                                    { id: 'allowed remove', title: 'Remove Number', description: 'Remove from allowed' }
                                ]
                            }, {
                                title: 'Chats Management',
                                rows: [
                                    { id: 'allowed chats', title: 'All Chats', description: 'View all chats' },
                                    { id: 'allowed groups', title: 'Groups Only', description: 'View groups only' },
                                    { id: 'allowed refresh', title: 'Refresh Chats', description: 'Load from store' }
                                ]
                            }, {
                                title: 'Settings',
                                rows: [
                                    { id: 'allowed settings', title: 'View Settings', description: 'Current settings' }
                                ]
                            }]
                        })
                    }
                ]
            });
            return;
        }
        
        // ─── NUMBERS ───────────────────────────────────────────────────────────
        if (subCommand === 'numbers') {
            const numbers = await db.getAllowedNumbers();
            if (numbers.length === 0) {
                return reply('No allowed numbers configured.');
            }
            
            let text = `*━━ ALLOWED NUMBERS ━━*\n\n`;
            numbers.forEach((num, i) => {
                text += `${i + 1}. +${num}\n`;
            });
            text += `\n_Total: ${numbers.length}_`;
            
            await reply(text);
            return;
        }
        
        if (subCommand === 'add') {
            const number = args[1];
            if (!number) {
                return reply('Usage: /allowed add <number>\nExample: /allowed add 628123456789');
            }
            
            const result = await db.addAllowedNumber(number);
            await reply(`✓ Added +${number.replace(/[^0-9]/g, '')} to allowed numbers.\n\nTotal: ${result.length}`);
            return;
        }
        
        if (subCommand === 'remove') {
            const number = args[1];
            if (!number) {
                return reply('Usage: /allowed remove <number>\nExample: /allowed remove 628123456789');
            }
            
            const result = await db.removeAllowedNumber(number);
            await reply(`✓ Removed +${number.replace(/[^0-9]/g, '')} from allowed numbers.\n\nRemaining: ${result.length}`);
            return;
        }
        
        // ─── CHATS ─────────────────────────────────────────────────────────────
        if (subCommand === 'chats' || subCommand === 'groups') {
            let chats = await db.getAllowedChats();
            
            if (subCommand === 'groups') {
                chats = chats.filter(c => c.chatType === 'group');
            }
            
            if (chats.length === 0) {
                return reply('No chats registered yet. Use /allowed refresh to load all chats.');
            }
            
            // Create interactive list
            const sections = [{
                title: subCommand === 'groups' ? 'Group Chats' : 'All Chats',
                rows: chats.map((c, i) => ({
                    id: `allowed toggle ${c.chatId} ${c.enabled ? 'disable' : 'enable'}`,
                    title: `${c.enabled ? '🟢' : '🔴'} ${i + 1}. ${c.chatName || 'Unknown'}`,
                    description: `${c.chatType} • ${c.enabled ? 'Enabled' : 'Disabled'}`
                }))
            }];
            
            let text = `*━━ ${subCommand === 'groups' ? 'GROUP CHATS' : 'ALL CHATS'} ━━*\n\n`;
            text += `Total: ${chats.length}\n\n`;
            text += `🟢 = Enabled\n🔴 = Disabled\n\n`;
            text += `_Select a chat to toggle_`;
            
            await reply(text, {
                interactiveButtons: [
                    {
                        name: 'single_select',
                        buttonParamsJson: JSON.stringify({
                            title: 'Toggle Chat',
                            sections
                        })
                    }
                ]
            });
            return;
        }
        
        if (subCommand === 'refresh') {
            await reply('🔄 Loading all chats from store...');
            
            const chats = await db.loadAllChatsFromStore(sock.store);
            
            let text = `*━━ CHATS REFRESHED ━━*\n\n`;
            text += `Total chats loaded: ${chats.length}\n`;
            text += `Groups: ${chats.filter(c => c.chatType === 'group').length}\n`;
            text += `Individual: ${chats.filter(c => c.chatType === 'individual').length}\n\n`;
            text += `_Use /allowed chats to manage_`;
            
            await reply(text);
            return;
        }
        
        // ─── TOGGLE ────────────────────────────────────────────────────────────
        if (subCommand === 'toggle') {
            const chatId = args[1];
            const action = args[2];
            
            if (!chatId || !action) {
                return reply('Invalid toggle command.');
            }
            
            const enabled = action === 'enable';
            const chat = await db.toggleAllowedChat(chatId, enabled);
            
            if (chat) {
                await reply(`✓ ${chat.chatName || chatId}\nStatus: ${enabled ? '🟢 Enabled' : '🔴 Disabled'}`);
            } else {
                await reply('Chat not found.');
            }
            return;
        }
        
        // ─── SETTINGS ──────────────────────────────────────────────────────────
        if (subCommand === 'settings') {
            const key = args[1];
            const value = args[2];
            
            if (!key) {
                const settings = await db.getSettings();
                let text = `*━━ SETTINGS ━━*\n\n`;
                for (const [k, v] of Object.entries(settings)) {
                    text += `${k}: ${typeof v === 'boolean' ? (v ? '✅' : '❌') : v}\n`;
                }
                await reply(text);
                return;
            }
            
            if (value !== undefined) {
                const boolValue = value === 'true' ? true : (value === 'false' ? false : value);
                await db.updateSetting(key, boolValue);
                await reply(`✓ Setting ${key} updated to: ${boolValue}`);
                return;
            }
            
            return reply('Usage: /allowed settings <key> <value>');
        }
        
        // ─── INTERACTIVE RESPONSE ──────────────────────────────────────────────
        // Handle interactive button responses
        if (m.isText && body.startsWith('allowed ')) {
            // This will be handled by message.upsert.js interactive response
            return;
        }
    }
};
