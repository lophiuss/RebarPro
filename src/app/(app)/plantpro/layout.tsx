import { ActionToaster } from './feedback'

export default function PlantproLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ActionToaster />
    </>
  )
}
