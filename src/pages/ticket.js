import {
  Text,
  Flex,
  Heading,
  useDisclosure,
} from '@chakra-ui/react'
import { Container } from '../components/Container'
import { Main } from '../components/Main'
import { Footer } from '../components/Footer'
import { useInterval } from '../utils'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import queryString from 'query-string';
import axios from 'axios'
import { TICKET_STATUS } from '../constants'
import { NavBar } from '../components/Navbar'
import useTranslation from 'next-translate/useTranslation'
import { InQueue } from '../components/Ticket/InQueue'
import { NextInQueue } from '../components/Ticket/NextInQueue'
import { Alerted } from '../components/Ticket/Alerted'
import { Skipped } from '../components/Ticket/Skipped'
import { Served } from '../components/Ticket/Served'
import { NotFound } from '../components/Ticket/NotFound'
import { LeaveModal } from '../components/Ticket/LeaveModal'
import { useCookies } from 'react-cookie';

const Index = () => {
  const { t, lang } = useTranslation('common')
  const router = useRouter()
  const [refreshEnabled, setRefreshEnabled] = useState(true)

  const waitTimePerTicket = process.env.NEXT_PUBLIC_WAIT_TIME_MINS || 3

  const [numberOfTicketsAhead, setNumberOfTicketsAhead] = useState()

  const [ticketState, setTicketState] = useState()
  const [ticketId, setTicketId] = useState()
  const [queueId, setQueueId] = useState()
  const [ticketNumber, setTicketNumber] = useState()
  const [displayTicketInfo, setDisplayTicketInfo] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')

  const [cookies, setCookie, removeCookie] = useCookies(['ticket']);

  // Leave queue modal
  const { isOpen, onOpen, onClose } = useDisclosure()

  useEffect(() => {
    const query = queryString.parse(location.search);
    if (query.ticket && query.queue && query.ticketNumber) {
      getTicketStatus(query.ticket, query.queue)
      setTicketNumber(query.ticketNumber)

      // Save ticket info to cookie
      setCookie('ticket', {
        queue: query.queue,
        ticket: query.ticket,
        ticketNumber: query.ticketNumber
      })
    }
  }, [])

  const refreshInterval = process.env.NEXT_PUBLIC_REFRESH_INTERVAL || 5000
  useInterval(() => {
    if (refreshEnabled) getTicketStatus(ticketId, queueId)
  }, refreshInterval);


  const getTicketStatus = async (ticket, currentQueue) => {
    try {
      const getTicket = await axios.get(`/.netlify/functions/ticket?id=${ticket}&queue=${currentQueue}`)
      const { queueId, queueName, ticketDesc, numberOfTicketsAhead } = getTicket.data
      setQueueId(queueId)
      setTicketId(ticket)
      if (ticketDesc !== '') {
        setDisplayTicketInfo(`${ticketDesc.name}, ${ticketDesc.contact}`)
      }
      setNumberOfTicketsAhead(numberOfTicketsAhead)

      // // Update timestamp
      const timestamp = new Date().toLocaleString('en-UK', { hour: 'numeric', minute: 'numeric', hour12: true })
      setLastUpdated(timestamp)

      // Hack: Check whether to alert the user based on if the 
      // queue name contains the word 'alert'
      // USING THE CONSTANT BREAKS I18N? IDK HOW
      if (queueName.includes('[ALERT]')) setTicketState('alerted')
      else if (queueName.includes('[DONE]')) {
        setTicketState('served')
        removeCookie('ticket') // Remove cookie so they can join the queue again
      }
      else if (queueName.includes('[MISSED]')) setTicketState('missed')
      else {
        setTicketState('pending')
      }

    } catch (err) {
      console.log(err);
      removeCookie('ticket') // Remove cookie so they can join the queue again
      setTicketState('error')
    }
  }

  const leaveQueue = async () => {
    try {
      axios.delete(`/.netlify/functions/ticket?id=${ticketId}`)
      removeCookie('ticket')
      router.push(`/`)
    } catch (error) {
      console.log(error)
    }
  }

  const rejoinQueue = async () => {
    const query = queryString.parse(location.search);
    if (query.queue) {
      // NOTE: Using query string queue as that is the initial queue not the current queue
      await axios.put(`/.netlify/functions/ticket?id=${ticketId}&queue=${query.queue}`)
      getTicketStatus(query.ticket, query.queue)
    }
  }

  const renderTicket = () => {
    // There are 4 possible ticket states
    // 1. Alerted - Ticket is called by admin
    if (ticketState === TICKET_STATUS.ALERTED) {
      return <Alerted
        waitingTime={waitTimePerTicket}
        openLeaveModal={onOpen}
        queueId={queueId}
        ticketId={ticketId}
      />
    }
    // 2. Served - Ticket is complete
    else if (ticketState === TICKET_STATUS.SERVED) {
      return <Served />
    }
    // 3. Missed - Ticket is in [MISSED] / not in the queue / queue doesnt exist
    else if (ticketState === TICKET_STATUS.MISSED || numberOfTicketsAhead === -1) {
      return <Skipped rejoinQueue={rejoinQueue} />
    }
    else if (ticketState === TICKET_STATUS.ERROR) {
      return <NotFound />
    }
    // 4. Next - Ticket 1st in line
    else if (numberOfTicketsAhead === 0) {
      return <NextInQueue
        waitingTime={waitTimePerTicket}
        openLeaveModal={onOpen}
        queueId={queueId}
        ticketId={ticketId}
        numberOfTicketsAhead={numberOfTicketsAhead}
      />
    }
    // 5. Line - Ticket is behind at least 1 person
    else if (numberOfTicketsAhead > 0) {
      return <InQueue
        waitingTime={waitTimePerTicket}
        openLeaveModal={onOpen}
        queueId={queueId}
        ticketId={ticketId}
        numberOfTicketsAhead={numberOfTicketsAhead}
      />
    }
    // This is blank as the loading state
    else {
      return <></>
    }

  }

  return (
    <Container>
      <LeaveModal isOpen={isOpen} onOpen={onOpen} onClose={onClose} leaveQueue={leaveQueue} />
      <NavBar />
      <Main>
        {ticketState != TICKET_STATUS.ERROR && <Flex direction="column" alignItems="center">
          <Heading textStyle="display2">#{ticketNumber}</Heading>
          <Text textStyle="display3" fontWeight="400">
            {displayTicketInfo}
          </Text>
        </Flex>}

        <Flex
          direction="column"
          alignItems="center"
        >
          <Flex
            direction="column"
            alignItems="center"
            w="360px"
            maxW="100%"
          >
            {renderTicket()}
          </Flex>
          <Flex
            direction="column"
            py={4}
            w="360px"
            maxW="100%"
          >
            <Text
              textAlign="center"
              textStyle="body2"
              color="gray.500"
            >
              {t("last-updated-automatically-at")} {lastUpdated}
            </Text>
          </Flex>
        </Flex>
      </Main>
      <Footer />
    </Container>
  )
}

export default Index
