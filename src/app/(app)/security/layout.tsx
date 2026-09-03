import SecurityPanicSystem from '@/components/SecurityPanicSystem'

// Wraps every /security/* page so the panic button and the realtime alert
// listener mount once and stay alive across navigation within the
// department, instead of remounting (and re-subscribing) on every page.
export default function SecurityLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <SecurityPanicSystem />
    </>
  )
}
