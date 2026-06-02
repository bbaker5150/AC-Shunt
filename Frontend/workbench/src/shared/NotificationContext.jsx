import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { gsap } from "gsap";
import {
  FaInfoCircle,
  FaTimes,
  FaCheckCircle,
  FaExclamationTriangle,
  FaExclamationCircle,
} from "react-icons/fa";

// ---------------------------------------------------------------------
// Shared toast / notification system.
// ---------------------------------------------------------------------
// Lifted out of the AC-Shunt App so every workbench module can raise
// toasts via useNotifications().showNotification(message, type, duration).
// The provider lives at the workbench root (index.jsx) and renders the
// toast stack globally.
//
// NOTE: the toast *styling* (.notification-toast*, .toast-*) currently
// lives in the AC-Shunt module's App.css and depends on its design-token
// variables. Those rules are global once the AC-Shunt module has loaded,
// which covers every toast source in the app today. When a second module
// needs to raise toasts before AC-Shunt has mounted, promote the design
// tokens + toast rules into a shared global stylesheet. See [[shared-theme-tokens]].
// ---------------------------------------------------------------------

const shouldReduceMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const NotificationContext = createContext(null);

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return ctx;
};

const Notification = ({
  id,
  message,
  type,
  duration,
  isClosing,
  onDismiss,
  onExited,
  registerRef,
  updateKey,
}) => {
  const toastRef = useRef(null);
  const iconRef = useRef(null);

  useEffect(() => {
    if (!toastRef.current) return;
    const reduceMotion = shouldReduceMotion();
    const toastNode = toastRef.current;
    if (isClosing) {
      if (reduceMotion) {
        onExited(id);
        return;
      }
      gsap.to(toastNode, {
        autoAlpha: 0,
        y: 18,
        scale: 0.96,
        duration: 0.22,
        ease: "power2.inOut",
        onComplete: () => onExited(id),
      });
      return;
    }
    if (reduceMotion) {
      gsap.set(toastNode, { autoAlpha: 1, y: 0, scale: 1, filter: "none" });
      return;
    }
    const tl = gsap.timeline();
    tl.fromTo(
      toastNode,
      {
        autoAlpha: 0,
        y: 28,
        scale: 0.94,
        rotateX: 8,
        filter: "blur(6px)",
      },
      {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        rotateX: 0,
        filter: "blur(0px)",
        duration: 0.34,
        ease: "power3.out",
      }
    );
    if (iconRef.current) {
      tl.fromTo(
        iconRef.current,
        { scale: 0.65, rotation: -14, autoAlpha: 0.6 },
        { scale: 1, rotation: 0, autoAlpha: 1, duration: 0.28, ease: "back.out(2)" },
        "<+0.02"
      );
    }
    return () => tl.kill();
  }, [id, isClosing, onExited]);

  // Map the notification type to a contextual icon
  const icons = {
    info: <FaInfoCircle />,
    success: <FaCheckCircle />,
    warning: <FaExclamationTriangle />,
    error: <FaExclamationCircle />,
  };

  return (
    <div
      ref={(node) => {
        toastRef.current = node;
        registerRef(id, node);
      }}
      className={`notification-toast toast-${type}${isClosing ? " is-closing" : ""}`}
      role="alert"
    >
      <div className="toast-icon" ref={iconRef}>
        {icons[type] || <FaInfoCircle />}
      </div>
      <div className="toast-content">{message}</div>
      <button
        onClick={() => onDismiss(id)}
        className="toast-dismiss"
        aria-label="Dismiss"
      >
        <FaTimes aria-hidden />
      </button>
    </div>
  );
};

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  const notificationsRef = useRef(notifications);
  notificationsRef.current = notifications;
  const toastTimeoutsRef = useRef({});
  const toastNodesRef = useRef({});
  const previousToastTopsRef = useRef(new Map());

  const showNotification = useCallback(
    (message, type = "info", duration = 4000) => {
      // Find an active toast with the same message and type
      const existingToast = notificationsRef.current.find(
        (t) => t.message === message && t.type === type && !t.isClosing
      );

      const isNew = !existingToast;
      const id = isNew
        ? `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        : existingToast.id;
      const updateKey = Date.now(); // Used to force the progress bar to restart

      // Clear the old timeout if it exists
      if (toastTimeoutsRef.current[id]) {
        window.clearTimeout(toastTimeoutsRef.current[id]);
        delete toastTimeoutsRef.current[id];
      }

      // Schedule the new closing timeout
      if (duration > 0) {
        const timeoutId = window.setTimeout(() => {
          setNotifications((prev) =>
            prev.map((toast) =>
              toast.id === id ? { ...toast, isClosing: true } : toast
            )
          );
          delete toastTimeoutsRef.current[id];
        }, duration);
        toastTimeoutsRef.current[id] = timeoutId;
      }

      setNotifications((prev) => {
        if (isNew) {
          // Add completely new toast
          const next = [
            { id, message, type, duration, isClosing: false, updateKey },
            ...prev,
          ].slice(0, 4);

          const retainedIds = new Set(next.map((t) => t.id));
          prev.forEach((toast) => {
            if (retainedIds.has(toast.id)) return;
            if (toastTimeoutsRef.current[toast.id]) {
              window.clearTimeout(toastTimeoutsRef.current[toast.id]);
              delete toastTimeoutsRef.current[toast.id];
            }
          });
          return next;
        } else {
          // Update the existing toast and bring it to the top of the stack
          const filtered = prev.filter((t) => t.id !== id);
          const updatedToast = {
            ...(prev.find((t) => t.id === id) || existingToast),
            isClosing: false,
            updateKey,
          };
          return [updatedToast, ...filtered];
        }
      });
    },
    []
  );

  // FLIP animation: smoothly slide remaining toasts when one leaves.
  useLayoutEffect(() => {
    if (shouldReduceMotion()) return;
    const nextTops = new Map();
    notifications.forEach((toast) => {
      const node = toastNodesRef.current[toast.id];
      if (!node) return;
      const top = node.getBoundingClientRect().top;
      nextTops.set(toast.id, top);
      const previousTop = previousToastTopsRef.current.get(toast.id);
      if (previousTop === undefined) return;
      const deltaY = previousTop - top;
      if (Math.abs(deltaY) < 1) return;
      gsap.fromTo(
        node,
        { y: deltaY },
        { y: 0, duration: 0.28, ease: "power2.out", overwrite: "auto" }
      );
    });
    previousToastTopsRef.current = nextTops;
  }, [notifications]);

  // Clear any pending dismiss timers on unmount.
  useEffect(
    () => () => {
      Object.values(toastTimeoutsRef.current).forEach((timeoutId) =>
        window.clearTimeout(timeoutId)
      );
    },
    []
  );

  const dismissNotification = useCallback((id) => {
    if (toastTimeoutsRef.current[id]) {
      window.clearTimeout(toastTimeoutsRef.current[id]);
      delete toastTimeoutsRef.current[id];
    }
    setNotifications((prev) =>
      prev.map((toast) =>
        toast.id === id ? { ...toast, isClosing: true } : toast
      )
    );
  }, []);

  const removeNotification = useCallback((id) => {
    delete toastNodesRef.current[id];
    previousToastTopsRef.current.delete(id);
    setNotifications((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const registerToastRef = useCallback((id, node) => {
    if (node) {
      toastNodesRef.current[id] = node;
      return;
    }
    delete toastNodesRef.current[id];
    previousToastTopsRef.current.delete(id);
  }, []);

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
      {notifications.length > 0 && (
        <div
          className="notification-toast-stack"
          aria-live="polite"
          aria-atomic="false"
        >
          {notifications.map((toast) => (
            <Notification
              key={toast.id}
              id={toast.id}
              message={toast.message}
              type={toast.type}
              duration={toast.duration}
              isClosing={toast.isClosing}
              onDismiss={dismissNotification}
              onExited={removeNotification}
              registerRef={registerToastRef}
              updateKey={toast.updateKey}
            />
          ))}
        </div>
      )}
    </NotificationContext.Provider>
  );
};
