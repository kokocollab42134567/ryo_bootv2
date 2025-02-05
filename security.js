const authorizedAdmins = ['14185764584@s.whatsapp.net']; // Add authorized numbers here

const handleGroupUpdate = async (sock, update) => {
    try {
        const { id, participants, action } = update;
        const groupMetadata = await sock.groupMetadata(id);
        
        for (const participant of participants) {
            const admins = groupMetadata.participants.filter(p => p.admin).map(p => p.id);
            const executor = update.participants[0];
            
            if (action === 'promote') {
                if (!authorizedAdmins.includes(executor)) {
                    await sock.groupParticipantsUpdate(id, [executor], 'demote');
                    await sock.groupParticipantsUpdate(id, [participant], 'demote');
                    console.log(`Unauthorized admin promotion detected. Demoted both executor ${executor} and promoted participant ${participant}`);
                }
            } else if (action === 'demote') {
                if (!authorizedAdmins.includes(executor)) {
                    await sock.groupParticipantsUpdate(id, [participant], 'promote');
                    await sock.groupParticipantsUpdate(id, [executor], 'demote');
                    console.log(`Unauthorized admin demotion detected. Restored admin to ${participant} and demoted executor ${executor}`);
                }
            } else if (action === 'remove') {
                if (!authorizedAdmins.includes(executor)) {
                    await sock.groupParticipantsUpdate(id, [participant], 'add');
                    await sock.groupParticipantsUpdate(id, [executor], 'demote');
                    console.log(`Unauthorized removal detected. Re-added ${participant} and demoted ${executor}`);
                }
            }
        }
    } catch (error) {
        console.error('Error handling group update:', error);
    }
};

module.exports = { handleGroupUpdate };
