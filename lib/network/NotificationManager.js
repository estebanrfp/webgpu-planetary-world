/**
 * Background Notification Manager
 * 
 * Note: Real-time GenosDB subscriptions have been removed.
 * This manager now provides a no-op interface for backwards compatibility.
 * 
 * Notifications can be triggered manually after successful transactions
 * or by implementing polling in the future if needed.
 */

export const createNotificationManager = (toastManager) => {
  let currentUser = null;

  /**
   * Initialize the notification manager
   * Note: Real-time subscriptions are disabled. Use manual notifications.
   */
  const init = async (userAddress) => {
    currentUser = userAddress?.toLowerCase();
    if (!currentUser) return;

    console.log('[NotificationManager] Initialized for', currentUser);
    console.log('[NotificationManager] Note: Real-time subscriptions disabled. Use Refresh button to check for updates.');
  };

  /**
   * Show a manual notification (can be called from transaction handlers)
   */
  const notify = (message, type = 'info') => {
    if (toastManager) {
      toastManager.show(message, type);
    }
  };

  /**
   * Stop listeners (no-op since subscriptions are disabled)
   */
  const destroy = () => {
    // No-op: real-time subscriptions are disabled
  };

  return {
    init,
    notify,
    destroy
  };
};
