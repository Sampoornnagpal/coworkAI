import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import api from '../api';

const TaskContext = createContext(null);

export function TaskProvider({ children }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState(() => {
    const saved = sessionStorage.getItem('chat_messages');
    return saved ? JSON.parse(saved) : [];
  });
  const [activeTask, setActiveTask] = useState(null);
  const eventSourceRef = useRef(null);
  // Track all active task SSE connections so old tasks can still deliver results
  const taskStreamsRef = useRef(new Map());

  useEffect(() => {
    sessionStorage.setItem('chat_messages', JSON.stringify(messages));
  }, [messages]);

  // Handle cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      // Close all tracked streams
      taskStreamsRef.current.forEach(es => es.close());
      taskStreamsRef.current.clear();
    };
  }, []);

  // Check task status if user navigates back and an active task is still processing
  useEffect(() => {
    if (!user) {
      setMessages([]);
      setActiveTask(null);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      taskStreamsRef.current.forEach(es => es.close());
      taskStreamsRef.current.clear();
      return;
    }

    if (activeTask && activeTask.status === 'processing') {
      const checkStatus = async () => {
        try {
          const res = await api.get(`/chat/task/${activeTask.taskId}/status`);
          if (res.data.status === 'completed') {
            setActiveTask(prev => ({ ...prev, status: 'completed' }));
            setMessages(p => [...p, {
              role: 'assistant',
              content: res.data.result,
              sources: res.data.sources
            }]);
          } else if (res.data.status === 'failed') {
            setActiveTask(prev => ({ ...prev, status: 'failed', error: res.data.error }));
            setMessages(p => [...p, {
              role: 'error',
              content: `Error: ${res.data.error}`
            }]);
          } else if (!eventSourceRef.current) {
            // Task is still processing but SSE is disconnected (e.g. from navigation or sleep)
            reconnectStream(activeTask.taskId, true);
          }
        } catch (err) {
          console.error("Failed to check task status", err);
        }
      };

      // Only check status if EventSource isn't open
      if (!eventSourceRef.current || eventSourceRef.current.readyState === EventSource.CLOSED) {
        checkStatus();
      }
    }
  }, [user]);

  /**
   * Connect an EventSource to a task's SSE stream.
   * @param {string} taskId - The task ID to stream
   * @param {boolean} isPrimary - If true, this is the activeTask's stream (stored in eventSourceRef).
   *                              If false, it's a background stream for an old task that was superseded.
   * @param {number} msgIndex - The index in the messages array where this task's assistant message
   *                            should be inserted (only used for background streams).
   */
  const reconnectStream = (taskId, isPrimary = true, msgIndex = null) => {
    const token = localStorage.getItem('token');
    if (!token) return;

    // Close existing primary stream if reconnecting as primary
    if (isPrimary && eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource(`http://localhost:8000/chat/stream/${taskId}?token=${token}`);

    if (isPrimary) {
      eventSourceRef.current = es;
    } else {
      taskStreamsRef.current.set(taskId, es);
    }

    // Named event: message — normal LLM chunks
    es.addEventListener('message', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.chunk) {
          if (isPrimary) {
            setActiveTask(prev => {
              if (!prev || prev.taskId !== taskId) return prev;
              return { ...prev, chunks: [...prev.chunks, data.chunk] };
            });
          }
          // For background streams, chunks are not rendered live (the user sent a new message).
          // The full result will be inserted when 'done' fires.
        }
      } catch (err) {
        console.error("Error parsing SSE message data", err);
      }
    });

    // Named event: done — task completed successfully
    es.addEventListener('done', (e) => {
      es.close();
      if (isPrimary) {
        eventSourceRef.current = null;
      } else {
        taskStreamsRef.current.delete(taskId);
      }

      try {
        const data = JSON.parse(e.data);

        if (isPrimary) {
          setActiveTask(prev => {
            if (prev && prev.taskId === taskId) {
              return { ...prev, status: 'completed', result: data.result };
            }
            return prev;
          });
        }

        // For background (non-primary) streams, insert the assistant message at the correct position
        if (!isPrimary && msgIndex !== null) {
          setMessages(p => {
            const updated = [...p];
            updated.splice(msgIndex, 0, {
              role: 'assistant',
              content: data.result,
              sources: data.sources
            });
            return updated;
          });
        } else {
          setMessages(p => [...p, {
            role: 'assistant',
            content: data.result,
            sources: data.sources
          }]);
        }
      } catch (err) {
        console.error("Error parsing done event", err);
      }
    });

    // Named event: task_error — backend task failed
    es.addEventListener('task_error', (e) => {
      es.close();
      if (isPrimary) {
        eventSourceRef.current = null;
      } else {
        taskStreamsRef.current.delete(taskId);
      }

      try {
        const data = JSON.parse(e.data);
        const errorMsg = data.error || 'An unknown error occurred.';

        if (isPrimary) {
          setActiveTask(prev => {
            if (prev && prev.taskId === taskId) {
              return { ...prev, status: 'failed', error: errorMsg };
            }
            return prev;
          });
        }

        setMessages(p => [...p, { role: 'error', content: errorMsg }]);
      } catch (err) {
        console.error("Error parsing task_error event", err);
        if (isPrimary) {
          setActiveTask(prev => {
            if (prev && prev.taskId === taskId) {
              return { ...prev, status: 'failed', error: 'Connection error' };
            }
            return prev;
          });
        }
        setMessages(p => [...p, { role: 'error', content: 'Connection error — could not reach the server.' }]);
      }
    });

    // Native EventSource error (connection drop, network failure — NOT a backend task_error)
    es.onerror = () => {
      // EventSource will auto-reconnect by default.
      // If it's permanently dead (readyState === CLOSED), clean up.
      if (es.readyState === EventSource.CLOSED) {
        if (isPrimary) {
          eventSourceRef.current = null;
        } else {
          taskStreamsRef.current.delete(taskId);
        }
      }
    };
  };

  const submitChat = async (question, options) => {
    // Snapshot current messages length BEFORE adding user message.
    // If there's already a processing task, we'll let its background stream
    // insert its result right after the last message before this new user message.
    const currentMsgCount = messages.length;
    const previousTask = activeTask;
    const previousEventSource = eventSourceRef.current;

    // Immediately add user message and set new activeTask
    setMessages(p => [...p, { role: 'user', content: question }]);
    setActiveTask({ taskId: null, status: 'processing', chunks: [] });

    // If there was a previous task still processing, demote its SSE to a background stream
    if (previousTask && previousTask.status === 'processing' && previousEventSource) {
      // Detach from primary ref — it becomes a background stream
      eventSourceRef.current = null;
      const oldTaskId = previousTask.taskId;
      if (oldTaskId) {
        // Move EventSource to the background map.
        // We don't re-create it — we just re-register its event handlers to insert
        // its result at the right position. But since we can't easily re-bind
        // addEventListener on an existing ES, the simplest approach is:
        // close old ES, open a fresh background one.
        previousEventSource.close();
        // The insert index is the current message count + 1 (after the just-added user message)
        // Actually, the old task's result should appear BEFORE the new user message,
        // i.e. at index = currentMsgCount (right before the new user message we just pushed).
        reconnectStream(oldTaskId, false, currentMsgCount);
      }
    }

    try {
      const { data } = await api.post('/chat/ask', {
        question,
        ...options
      });

      const taskId = data.task_id;
      setActiveTask({ taskId, status: 'processing', chunks: [] });
      reconnectStream(taskId, true);
    } catch (err) {
      setActiveTask(null);
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      const isRateLimit = status === 429
          && detail && typeof detail === 'object'
          && detail.error_type === 'rate_limit';

      if (isRateLimit) {
          // Inline error bubble — do NOT open the credit modal
          setMessages(p => [...p, { role: 'error', content: detail.message }]);
      } else if (status === 429) {
          // Existing monthly-budget behavior — open the credit modal (unchanged)
          throw err;
      } else {
          const content = typeof detail === 'string' ? detail : (detail ? JSON.stringify(detail) : (err.message || "An error occurred."));
          setMessages(p => [...p, {
            role: 'error',
            content
          }]);
      }
    }
  };

  const clearChat = () => {
    setMessages([]);
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    taskStreamsRef.current.forEach(es => es.close());
    taskStreamsRef.current.clear();
    setActiveTask(null);
  };

  return (
    <TaskContext.Provider value={{ messages, activeTask, submitChat, clearChat }}>
      {children}
    </TaskContext.Provider>
  );
}

export const useTask = () => useContext(TaskContext);
