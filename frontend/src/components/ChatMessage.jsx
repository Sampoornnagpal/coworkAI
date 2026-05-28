import { motion } from 'framer-motion';

const badgeContainerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.07, delayChildren: 0.2 }
  }
};

const badgeVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 400, damping: 25 } }
};

export default function ChatMessage({ message }) {
  const isUser = message.role === 'user';
  
  return (
    <motion.div
      className={`flex flex-col mb-6 ${isUser ? 'items-end' : 'items-start'}`}
      initial={{ opacity: 0, y: 20, x: isUser ? 20 : -20 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
    >
      <motion.div 
        className={`max-w-[85%] px-5 py-4 ${
          isUser 
            ? 'bg-primary-light text-primary border border-primary/10 rounded-2xl rounded-tr-sm' 
            : message.isError 
              ? 'bg-red-50 text-danger border border-red-100 rounded-2xl rounded-tl-sm'
              : 'bg-surface border border-border text-text-primary rounded-2xl rounded-tl-sm'
        }`}
        whileHover={{ scale: 1.01 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      >
        <div className="whitespace-pre-wrap leading-relaxed text-[15px]">
          {message.content}
        </div>
      </motion.div>
      
      {!isUser && message.sources?.length > 0 && (
        <motion.div
          className="mt-2 flex flex-wrap gap-2 max-w-[85%]"
          variants={badgeContainerVariants}
          initial="hidden"
          animate="visible"
        >
          {message.sources.map((s, idx) => (
            <motion.div key={idx} variants={badgeVariants} className="flex items-center gap-1.5 px-2.5 py-1 bg-background border border-border rounded-badge shadow-sm">
              <svg className="w-3.5 h-3.5 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <span className="text-[11px] font-medium text-text-secondary truncate max-w-[150px]">
                {s.filename}
              </span>
              <span className="text-[10px] text-text-tertiary bg-surface px-1.5 py-0.5 rounded-full">
                {Math.round(s.relevance * 100)}%
              </span>
            </motion.div>
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}
